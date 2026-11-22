import { supabase } from "./supabase.js";
// =====================================================
// LINKIFY GOOGLE SHEETS MANAGER
// =====================================================
const vendorSelect = document.getElementById("sheetVendor");
const sheetUrlInput = document.getElementById("spreadsheetUrl");
const connectForm = document.getElementById("sheetConnectForm");
const loadTabsButton = document.getElementById("loadTabsButton");
const saveSheetButton = document.getElementById("saveSheetButton");
const sheetMessage = document.getElementById("sheetMessage");
const tabsContainer = document.getElementById("sheetTabsContainer");
const tabsList = document.getElementById("sheetTabsList");
const connectedSheetsBody = document.getElementById("connectedSheetsBody");
let loadedSheet = null;
let loadedTabs = [];
let activePreview = null;
let currentPreviewRows = [];

// =====================================================
// COLUMN MAPPING
// =====================================================
const FIELD_OPTIONS = [
    { value: "", label: "Do not import" },
    { value: "domain", label: "Domain / Website" },
    { value: "website_status", label: "Website Status" },
    { value: "author_name", label: "Author Name" },
    { value: "da", label: "Domain Authority (DA)" },
    { value: "dr", label: "Domain Rating (DR)" },
    { value: "pa", label: "Page Authority (PA)" },
    { value: "traffic", label: "Traffic" },
    { value: "price_usd", label: "Guest Post Price (USD)" },
    { value: "price_pkr", label: "Guest Post Price (PKR)" },
    { value: "tat", label: "Turnaround Time" },
    { value: "link_type", label: "Link Type" }
];

const ALIASES = {
    domain: [
    "website", "websites", "domain", "domains",
    "url", "urls", "site", "site name","website list", "self admin access and authors sites ",
    "website url", "website name", "domains/url's","guest post site name","websites url", "urls", "ulr", "site", "site name","guest post sites url","website / domain"
],
    website_status: [
        "status", "website status", "site status"
    ],
    author_name: [
        "author name", "author", "vendor name"
    ],
    da: [
        "da", "domain authority"
    ],
    dr: [
        "dr", "domain rating"
    ],
    pa: [
        "pa", "page authority"
    ],
    traffic: [
        "traffic", "monthly traffic", "organic traffic",
        "monthly visitors"
    ],
    price_usd: [
        "gp usd", "guest post usd", "guest posting usd",
        "price usd", "usd price", "guest post price",
        "price", "usd"
    ],
    price_pkr: [
        "gp pkr", "guest post pkr", "guest posting pkr",
        "price pkr", "pkr price"
    ],
    tat: [
        "tat", "turnaround time", "delivery time"
    ],
    link_type: [
        "links", "link type", "link"
    ]
};

function normalizeHeader(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ");
}

function detectField(header) {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(ALIASES)) {
        if (aliases.includes(normalized)) {
            return field;
        }
    }
    return "";
}

// =====================================================
// MESSAGE
// =====================================================
function showMessage(message, type = "info") {
    if (!sheetMessage) return;
    sheetMessage.textContent = message;
    const colors = {
        success: "#15803d",
        error: "#dc2626",
        info: "#475569"
    };
    sheetMessage.style.color = colors[type] || colors.info;
}

// =====================================================
// EDGE FUNCTION ERROR DETAILS
// =====================================================
async function getFunctionError(error) {
    if (error?.context) {
        try {
            const response = error.context.clone
                ? error.context.clone()
                : error.context;
            const body = await response.json();
            console.error("Edge Function response:", body);
            return body.error ||
                body.message ||
                JSON.stringify(body);
        } catch (parseError) {
            console.error("Error reading function response:", parseError);
        }
    }
    return error?.message || "Edge Function request failed.";
}

// =====================================================
// LOAD VENDORS
// =====================================================
async function loadVendorOptions() {
    vendorSelect.innerHTML =
        '<option value="">Loading vendors...</option>';

    const { data, error } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("is_enabled", true)
        .order("name");

    if (error) {
        vendorSelect.innerHTML =
            '<option value="">Could not load vendors</option>';
        showMessage(error.message, "error");
        return;
    }

    vendorSelect.innerHTML =
        '<option value="">Select a vendor</option>';

    (data || []).forEach(vendor => {
        const option = document.createElement("option");
        option.value = vendor.id;
        option.textContent = vendor.name;
        vendorSelect.appendChild(option);
    });

    if (!data || data.length === 0) {
        vendorSelect.innerHTML =
            '<option value="">Add a vendor first</option>';
    }
}

// =====================================================
// LOAD GOOGLE SHEET TABS
// =====================================================
async function loadGoogleSheetTabs() {
    const vendorId = vendorSelect.value;
    const spreadsheetUrl = sheetUrlInput.value.trim();

    if (!vendorId) {
        showMessage("Please select a vendor first.", "error");
        return;
    }

    if (!spreadsheetUrl) {
        showMessage("Please enter a Google Sheet URL.", "error");
        return;
    }

    loadTabsButton.disabled = true;
    saveSheetButton.disabled = true;
    tabsContainer.classList.add("hidden");
    loadedSheet = null;
    loadedTabs = [];
    showMessage("Connecting to Google Sheets...");

    try {
        const { data, error } = await supabase.functions.invoke(
            "get-google-sheet-tabs",
            {
                body: { spreadsheetUrl }
            }
        );

        if (error) {
            throw new Error(await getFunctionError(error));
        }

        if (!data || !data.success) {
            throw new Error(data?.error || "Could not load sheet tabs.");
        }

        if (!data.tabs || data.tabs.length === 0) {
            throw new Error("No tabs found in this Google Sheet.");
        }

        loadedSheet = {
            vendorId,
            spreadsheetUrl,
            spreadsheetId: data.spreadsheetId,
            spreadsheetTitle: data.spreadsheetTitle
        };

        loadedTabs = data.tabs;
        renderSheetTabs();
        tabsContainer.classList.remove("hidden");

        showMessage(
            `Connected: ${data.spreadsheetTitle}. Select tabs to save.`,
            "success"
        );
    } catch (error) {
        console.error("Google Sheet connection error:", error);
        showMessage(error.message, "error");
    } finally {
        loadTabsButton.disabled = false;
        saveSheetButton.disabled = false;
    }
}

// =====================================================
// RENDER TABS
// =====================================================
function renderSheetTabs() {
    tabsList.innerHTML = "";

    loadedTabs.forEach(tab => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        const name = document.createElement("span");

        checkbox.type = "checkbox";
        checkbox.value = String(tab.sheetId);
        checkbox.checked = true;
        name.textContent = tab.title;

        label.append(checkbox, name);
        tabsList.appendChild(label);
    });
}
// =====================================================
// SAVE SHEET CONNECTION
// =====================================================
async function saveSheetConnection() {
    if (!loadedSheet) {
        showMessage("Please connect a Google Sheet first.", "error");
                return;
    }

    const selectedTabs = loadedTabs.filter(tab => {
        const checkbox = tabsList.querySelector(
            `input[value="${String(tab.sheetId)}"]`
        );
        return checkbox?.checked;
    });

    if (selectedTabs.length === 0) {
        showMessage("Please select at least one tab.", "error");
        return;
    }

    saveSheetButton.disabled = true;

    try {
        const { data: existingSource, error: checkError } =
            await supabase
                .from("sources")
                .select("id")
                .eq("vendor_id", loadedSheet.vendorId)
                .maybeSingle();

        if (checkError) throw checkError;

        if (existingSource) {
            const vendorName =
                vendorSelect.options[vendorSelect.selectedIndex].text;

            const confirmed = window.confirm(
                `A Google Sheet already exists for ${vendorName}.\n\n` +
                "Replacing it will delete its old imported listings, tabs and sync history.\n\n" +
                "Do you want to replace the old sheet?"
            );

            if (!confirmed) {
                showMessage("Sheet replacement cancelled.", "info");
                return;
            }

            const { error: deleteError } = await supabase
                .from("sources")
                .delete()
                .eq("id", existingSource.id);

            if (deleteError) throw deleteError;
        }

        const { data: newSource, error: sourceError } =
            await supabase
                .from("sources")
                .insert({
                    vendor_id: loadedSheet.vendorId,
                    spreadsheet_id: loadedSheet.spreadsheetId,
                    sheet_url: loadedSheet.spreadsheetUrl,
                    spreadsheet_title: loadedSheet.spreadsheetTitle,
                    status: "pending"
                })
                .select()
                .single();

        if (sourceError) throw sourceError;

        const tabRecords = loadedTabs.map(tab => {
            const selected = selectedTabs.some(
                item => String(item.sheetId) === String(tab.sheetId)
            );

            return {
                source_id: newSource.id,
                sheet_gid: String(tab.sheetId),
                tab_name: tab.title,
                is_selected: selected,
                is_enabled: selected
            };
        });

        const { error: tabsError } = await supabase
            .from("tabs")
            .insert(tabRecords);

        if (tabsError) throw tabsError;

        showMessage(
            "Google Sheet connection saved successfully!",
            "success"
        );

        connectForm.reset();
        tabsContainer.classList.add("hidden");
        loadedSheet = null;
        loadedTabs = [];

        await loadConnectedSheets();

        window.dispatchEvent(
            new CustomEvent("linkify-sheets-updated")
        );
    } catch (error) {
        console.error("Save sheet error:", error);
        showMessage(error.message, "error");
    } finally {
        saveSheetButton.disabled = false;
    }
}

// =====================================================
// LOAD CONNECTED SHEETS
// =====================================================
async function loadConnectedSheets() {
    connectedSheetsBody.innerHTML = `
        <tr><td colspan="5">Loading connected sheets...</td></tr>
    `;

    const { data, error } = await supabase
        .from("sources")
        .select(`
            id,
            vendor_id,
            spreadsheet_id,
            sheet_url,
            spreadsheet_title,
            status,
            last_synced_at,
            vendors(name),
            tabs(id, tab_name, is_selected, is_enabled, last_row_count)
        `)
        .order("created_at", { ascending: false });

    if (error) {
        connectedSheetsBody.innerHTML = `
            <tr><td colspan="5">Could not load connected sheets.</td></tr>
        `;
        console.error("Load sheets error:", error);
        return;
    }

    connectedSheetsBody.innerHTML = "";

    if (!data || data.length === 0) {
        connectedSheetsBody.innerHTML = `
            <tr><td colspan="5">No Google Sheets connected yet.</td></tr>
        `;
        return;
    }

    data.forEach(source => {
        const row = document.createElement("tr");

        const vendorCell = document.createElement("td");
        vendorCell.textContent = source.vendors?.name || "Unknown";

        const sheetCell = document.createElement("td");
        const link = document.createElement("a");
        link.href = source.sheet_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.spreadsheet_title || "Open Sheet";
        sheetCell.appendChild(link);

        const tabsCell = document.createElement("td");
        const selectedTabs = (source.tabs || [])
            .filter(tab => tab.is_selected && tab.is_enabled);

        tabsCell.textContent = selectedTabs.length
            ? selectedTabs.map(tab => tab.tab_name).join(", ")
            : "No selected tabs";

        const syncCell = document.createElement("td");
        syncCell.textContent = source.last_synced_at
            ? new Date(source.last_synced_at).toLocaleString()
            : "Not synced yet";

        const actionsCell = document.createElement("td");

        const refreshButton = document.createElement("button");
        refreshButton.type = "button";
        refreshButton.className = "primary-button";
        refreshButton.textContent = "Refresh Sheet";
        refreshButton.style.marginRight = "6px";
        refreshButton.addEventListener("click", () => {
            refreshConnectedSheet(source, refreshButton);
        });

        const previewButton = document.createElement("button");
        previewButton.type = "button";
        previewButton.className = "secondary-button";
        previewButton.textContent = "Preview Import";
        previewButton.addEventListener("click", () => {
            openImportPreview(source);
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "secondary-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
                        deleteConnectedSheet(source.id, source.vendors?.name);
        });

        actionsCell.append(refreshButton, previewButton, deleteButton);

        row.append(
            vendorCell,
            sheetCell,
            tabsCell,
            syncCell,
            actionsCell
        );

        connectedSheetsBody.appendChild(row);
    });
}

// =====================================================
// PREVIEW PANEL
// =====================================================
function createPreviewPanel() {
    let panel = document.getElementById("importPreviewPanel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "importPreviewPanel";
        panel.className = "sheet-connect-box";
        panel.style.marginTop = "25px";

        const parent = document.querySelector(
            "#sheets .connected-sheets"
        );

        if (!parent) {
            throw new Error("Connected sheets container not found.");
        }

        parent.appendChild(panel);
    }

    return panel;
}

// =====================================================
// FETCH GOOGLE SHEET DATA
// =====================================================

async function fetchTabRows(source, tab) {
    if (!source?.id || !tab?.id) {
        throw new Error(
            "Source ID or Tab ID is missing. Please refresh the page and try again."
        );
    }

    const { data: savedSource, error: sourceError } = await supabase
        .from("sources")
        .select("id, spreadsheet_id, spreadsheet_title")
        .eq("id", source.id)
        .single();

    if (sourceError) throw sourceError;

    const { data: savedTab, error: tabError } = await supabase
        .from("tabs")
        .select("id, tab_name, sheet_gid, is_selected, is_enabled")
        .eq("id", tab.id)
        .eq("source_id", source.id)
        .single();

    if (tabError) throw tabError;

    const spreadsheetId = String(
        savedSource?.spreadsheet_id || ""
    ).trim();

    const tabName = String(
        savedTab?.tab_name || ""
    ).trim();

    const sheetGid = Number(savedTab?.sheet_gid);

    console.log("Google Sheet import request:", {
        spreadsheetId,
        tabName,
        sheetGid,
        sourceId: savedSource?.id,
        tabId: savedTab?.id
    });

    if (!spreadsheetId) {
        throw new Error(
            "Spreadsheet ID is missing in the saved database record."
        );
    }

    if (
        savedTab?.sheet_gid === null ||
        savedTab?.sheet_gid === undefined ||
        !Number.isSafeInteger(sheetGid) ||
        sheetGid < 0
    ) {
        throw new Error(
            `A valid Sheet GID is missing for tab "${tabName}". Please reconnect this Google Sheet.`
        );
    }

    const { data, error } = await supabase.functions.invoke(
        "get-google-sheet-data",
        {
            body: {
                spreadsheetId,
                tabName,
                sheetGid,
                spreadsheet_id: spreadsheetId,
                tab_name: tabName,
                sheet_gid: sheetGid
            }
        }
    );

    if (error) {
        const message = await getFunctionError(error);

        console.error("Google Sheet data error:", {
            spreadsheetId,
            tabName,
            sheetGid,
            message
        });

        throw new Error(message);
    }

    if (!data || !data.success) {
        throw new Error(
            data?.error || "Could not read sheet data."
        );
    }

    return data.rows || [];
}

// =====================================================
// HEADER ROW DETECTION
// Searches the first 10 rows
// =====================================================
function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;

        const hasDomain = row.some(cell => {
            return detectField(cell) === "domain";
        });

        if (hasDomain) {
            return i;
        }
    }

    return -1;
}

// =====================================================
// OPEN IMPORT PREVIEW: SHOW SELECTED TABS
// =====================================================
async function openImportPreview(source) {
    const panel = createPreviewPanel();
    panel.innerHTML = "<p>Loading selected tabs...</p>";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        const { data: tabs, error } = await supabase
            .from("tabs")
            .select("id, sheet_gid, tab_name, is_selected, is_enabled, last_row_count")
            .eq("source_id", source.id)
            .eq("is_selected", true)
            .eq("is_enabled", true)
            .order("created_at");

        if (error) throw error;

        if (!tabs || tabs.length === 0) {
            throw new Error("No enabled tabs found for this sheet.");
        }

        renderTabChooser(panel, source, tabs);
    } catch (error) {
        console.error("Load selected tabs error:", error);
        panel.innerHTML = "";

        const title = document.createElement("h3");
        title.textContent = "Import Preview";

        const message = document.createElement("p");
        message.style.color = "#dc2626";
        message.textContent =
            error.message || "Could not load selected tabs.";

        panel.append(title, message);
    }
}

// =====================================================
// TAB-WISE PREVIEW CHOOSER
// =====================================================
function renderTabChooser(panel, source, tabs) {
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent =
        `Select a Tab: ${source.spreadsheet_title || "Google Sheet"}`;

    const description = document.createElement("p");
    description.textContent =
        "Each tab is handled separately. Preview and import one tab at a time.";

    const tableWrap = document.createElement("div");
    tableWrap.style.overflowX = "auto";

    const table = document.createElement("table");
    table.className = "vendor-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th>Tab Name</th>
            <th>Last Imported Records</th>
            <th>Action</th>
        </tr>
    `;

    const tbody = document.createElement("tbody");

    tabs.forEach(tab => {
        const tr = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = tab.tab_name;

        const countCell = document.createElement("td");
        countCell.textContent =
            Number(tab.last_row_count || 0).toLocaleString();

        const actionCell = document.createElement("td");

        const previewButton = document.createElement("button");
        previewButton.type = "button";
        previewButton.className = "primary-button";
        previewButton.textContent = "Preview";

        previewButton.addEventListener("click", () => {
            previewSpecificTab(source, tab, panel);
        });

        actionCell.appendChild(previewButton);
        tr.append(nameCell, countCell, actionCell);
        tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    tableWrap.appendChild(table);
    panel.append(title, description, tableWrap);
}

// =====================================================
// PREVIEW ONE SELECTED TAB ONLY
// =====================================================
async function previewSpecificTab(source, tab, panel) {
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = `Import Preview: ${tab.tab_name}`;

    const loading = document.createElement("p");
    loading.textContent = "Loading this tab's data...";

    panel.append(title, loading);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        const rows = await fetchTabRows(source, tab);

        if (!rows.length) {
            throw new Error(`The "${tab.tab_name}" tab is empty.`);
        }

        const headerRowIndex = findHeaderRow(rows);

        if (headerRowIndex === -1) {
            console.error("First 30 sheet rows:", rows.slice(0, 30));

            throw new Error(
                `Could not find a Websites, Website, Domain or URL header in the first 30 rows of "${tab.tab_name}". Check the browser Console for the sheet rows.`
            );
        }

        const headers = rows[headerRowIndex].map((header, index) =>
            String(header || `Column ${index + 1}`).trim()
        );

        const mapping = headers.map((header, index) => ({
            index,
            header,
            field: detectField(header)
        }));

        activePreview = {
            source,
            tab,
            headers,
            mapping,
            headerRowIndex,
            totalRows: rows.length - headerRowIndex - 1
        };

        currentPreviewRows = rows.slice(headerRowIndex + 1);
        renderImportPreview(panel);

    } catch (error) {
        console.error("Tab preview error:", error);
        panel.innerHTML = "";

        const errorTitle = document.createElement("h3");
                errorTitle.textContent = `Import Preview: ${tab.tab_name}`;

        const message = document.createElement("p");
        message.style.color = "#dc2626";
        message.textContent =
            error.message || "Could not preview this tab.";

        const backButton = document.createElement("button");
        backButton.type = "button";
        backButton.className = "secondary-button";
        backButton.textContent = "Choose Another Tab";
        backButton.style.marginTop = "12px";

        backButton.addEventListener("click", () => {
            openImportPreview(source);
        });

        panel.append(errorTitle, message, backButton);
    }
}

// =====================================================
// RENDER IMPORT PREVIEW
// =====================================================
function renderImportPreview(panel) {
    const { tab, headers, mapping, totalRows, headerRowIndex } =
        activePreview;

    panel.innerHTML = "";

    const chooseTabButton = document.createElement("button");
    chooseTabButton.type = "button";
    chooseTabButton.className = "secondary-button";
    chooseTabButton.textContent = "Choose Another Tab";
    chooseTabButton.style.marginBottom = "15px";

    chooseTabButton.addEventListener("click", () => {
        openImportPreview(activePreview.source);
    });

    const title = document.createElement("h3");
    title.textContent = `Import Preview: ${tab.tab_name}`;

    const description = document.createElement("p");
    description.textContent =
        `${totalRows.toLocaleString()} records found. Header detected on row ${headerRowIndex + 1}. Review the mapping before importing.`;

    const mappingTitle = document.createElement("h3");
    mappingTitle.textContent = "Column Mapping";
    mappingTitle.style.marginTop = "25px";

    const mappingTable = document.createElement("table");
    mappingTable.className = "vendor-table";

    const mappingHead = document.createElement("thead");
    mappingHead.innerHTML = `
        <tr>
            <th>Google Sheet Column</th>
            <th>Database Field</th>
        </tr>
    `;

    const mappingBody = document.createElement("tbody");

    mapping.forEach(item => {
        const tr = document.createElement("tr");

        const headerCell = document.createElement("td");
        headerCell.textContent = item.header;

        const selectCell = document.createElement("td");
        const select = document.createElement("select");

        select.dataset.columnIndex = item.index;
        select.style.width = "100%";
        select.style.padding = "9px";
        select.style.border = "1px solid #cbd5e1";
        select.style.borderRadius = "6px";

        FIELD_OPTIONS.forEach(optionData => {
            const option = document.createElement("option");
            option.value = optionData.value;
            option.textContent = optionData.label;
            select.appendChild(option);
        });

        select.value = item.field;
        selectCell.appendChild(select);
        tr.append(headerCell, selectCell);
        mappingBody.appendChild(tr);
    });

    mappingTable.append(mappingHead, mappingBody);

    const previewTitle = document.createElement("h3");
    previewTitle.textContent = "First 10 Records";
    previewTitle.style.marginTop = "25px";

    const previewWrap = document.createElement("div");
    previewWrap.style.overflowX = "auto";

    const previewTable = document.createElement("table");
    previewTable.className = "vendor-table";

    const previewHead = document.createElement("thead");
    const previewHeadRow = document.createElement("tr");

    headers.forEach(header => {
        const th = document.createElement("th");
        th.textContent = header;
        previewHeadRow.appendChild(th);
    });

    previewHead.appendChild(previewHeadRow);

    const previewBody = document.createElement("tbody");

    currentPreviewRows.slice(0, 10).forEach(row => {
        const tr = document.createElement("tr");

        headers.forEach((header, index) => {
            const td = document.createElement("td");
            td.textContent = row[index] ?? "";
            tr.appendChild(td);
        });

        previewBody.appendChild(tr);
    });

    previewTable.append(previewHead, previewBody);
    previewWrap.appendChild(previewTable);

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "primary-button";
    importButton.textContent = "Confirm and Import All Records";
    importButton.style.marginTop = "20px";

    importButton.addEventListener("click", () => {
        importPreviewData(importButton);
    });

    const note = document.createElement("p");
    note.style.marginTop = "12px";
    note.textContent =
        "Please verify the mapping and sample records before importing.";

    panel.append(
        chooseTabButton,
        title,
        description,
        mappingTitle,
        mappingTable,
        previewTitle,
        previewWrap,
        note,
        importButton
    );
}
// =====================================================
// DATA HELPERS
// =====================================================
function parseNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const cleaned = String(value)
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");

    if (!cleaned || cleaned === "-" || cleaned === ".") {
        return null;
    }

    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
}

function parseRangeNumber(value, min, max) {
    const number = parseNumber(value);

    if (number === null) return null;

    if (number < min || number > max) {
        return null;
    }

    return number;
}

// =====================================================
// CENTRAL DOMAIN CLEANING
// Applies to every vendor and every imported sheet.
// =====================================================
function cleanDomain(value) {
    let domain = String(value || "").trim();

    if (!domain) return "";

    // Remove text after arrows
    domain = domain.split(/[→➜➔]/)[0];

    // Remove annotations such as (New), (Updated)
    domain = domain.replace(/\s*\([^)]*\)/g, "");

    // Remove asterisks and extra spaces
    domain = domain.replace(/\*+/g, "");
    domain = domain.trim();

    // Remove protocol
    domain = domain.replace(/^https?:\/\//i, "");

    // Remove www
    domain = domain.replace(/^www\./i, "");

    // Remove URL paths, query strings and fragments
    domain = domain.split(/[/?#]/)[0];

    // Remove trailing dots and spaces
    domain = domain.replace(/[.\s]+$/, "");

    return domain.trim();
}

function normalizeDomain(value) {
    return cleanDomain(value).toLowerCase();
}

function getMappingFromUI() {
    const panel = document.getElementById("importPreviewPanel");
    const selects = panel.querySelectorAll(
        "select[data-column-index]"
    );

    const result = {};

    selects.forEach(select => {
        if (select.value) {
            result[select.dataset.columnIndex] = select.value;
        }
    });

    return result;
}

// =====================================================
// IMPORT RECORDS
// Matches the actual listings table schema
// =====================================================
async function importPreviewData(button) {
    if (!activePreview) return;

    const mapping = getMappingFromUI();

    const domainIndex = Object.keys(mapping).find(
        index => mapping[index] === "domain"
    );

    if (domainIndex === undefined) {
        alert("Please map one column to Domain / Website.");
        return;
    }

    const mappedFields = Object.values(mapping);

    if (new Set(mappedFields).size !== mappedFields.length) {
        alert("Each database field can only be assigned once.");
        return;
    }

    const confirmed = window.confirm(
        `Import ${activePreview.totalRows.toLocaleString()} rows from ${activePreview.tab.tab_name}?\n\n` +
        "Existing records with the same source row will be updated."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Preparing import...";

    let syncRunId = null;

    try {
        const { data: authData, error: authError } =
            await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
            throw new Error(
                "Your login session has expired. Please log in again."
            );
        }

        const { data: syncRun, error: runError } = await supabase
            .from("sync_runs")
            .insert({
                source_id: activePreview.source.id,
                status: "running",
                total_rows: activePreview.totalRows,
                started_by: authData.user.id
            })
            .select()
            .single();

        if (runError) throw runError;

        syncRunId = syncRun.id;

        const mappingRecords = activePreview.mapping.map(item => ({
            tab_id: activePreview.tab.id,
            source_column: item.header,
            source_column_index: item.index,
            target_field: mapping[item.index] || null,
            is_mapped: Boolean(mapping[item.index])
        }));

        const { error: mappingDeleteError } = await supabase
            .from("column_mappings")
            .delete()
            .eq("tab_id", activePreview.tab.id);

        if (mappingDeleteError) throw mappingDeleteError;

        const { error: mappingInsertError } = await supabase
            .from("column_mappings")
            .insert(mappingRecords);

        if (mappingInsertError) throw mappingInsertError;

        const records = [];
        let skippedRows = 0;

        currentPreviewRows.forEach((row, index) => {
            const rawData = {};

            activePreview.headers.forEach((header, columnIndex) => {
                rawData[header] = row[columnIndex] ?? null;
            });

            const getValue = field => {
                const columnIndex = Object.keys(mapping).find(
                    key => mapping[key] === field
                );

                return columnIndex === undefined
                    ? null
                    : row[Number(columnIndex)] ?? null;
            };

            // Clean domain for every vendor and every sheet
            const domain = cleanDomain(getValue("domain"));
            const normalizedDomain = normalizeDomain(domain);

            if (!domain || !normalizedDomain) {
                skippedRows++;
                return;
            }

            const usdValue = getValue("price_usd");
            const pkrValue = getValue("price_pkr");

            const selectedPrice = usdValue !== null && usdValue !== ""
                ? usdValue
                : pkrValue;

            const selectedCurrency = usdValue !== null && usdValue !== ""
                ? "USD"
                : pkrValue !== null && pkrValue !== ""
                    ? "PKR"
                    : null;

            const rowNumber =
                index + activePreview.headerRowIndex + 2;

            records.push({
                vendor_id: activePreview.source.vendor_id,
                tab_id: activePreview.tab.id,
                domain,
                normalized_domain: normalizedDomain,
                gp_pkr: parseNumber(pkrValue),
                gp_usd: parseNumber(usdValue),
                price: parseNumber(selectedPrice),
                currency: selectedCurrency,
                price_raw: selectedPrice === null ||
                    selectedPrice === undefined
                    ? null
                    : String(selectedPrice),
                da: parseRangeNumber(getValue("da"), 0, 100),
                dr: parseRangeNumber(getValue("dr"), 0, 100),
                pa: parseNumber(getValue("pa")),
                traffic: parseRangeNumber(
                    getValue("traffic"),
                    0,
                    Number.MAX_SAFE_INTEGER
                ),
                link_type: getValue("link_type") || null,
                tat: getValue("tat") || null,
                website_status: getValue("website_status") || null,
                source_row_number: rowNumber,
                raw_data: rawData,
                is_active: true,
                synced_at: new Date().toISOString()
            });
        });

        let importedCount = 0;

        for (let i = 0; i < records.length; i += 500) {
            const batch = records.slice(i, i + 500);

            button.textContent =
                `Importing ${Math.min(i + batch.length, records.length).toLocaleString()} / ${records.length.toLocaleString()}...`;

            const { error } = await supabase
                .from("listings")
                .upsert(batch, {
                    onConflict: "tab_id,source_row_number"
                });

            if (error) throw error;

            importedCount += batch.length;
        }

        const now = new Date().toISOString();

        const { error: tabUpdateError } = await supabase
            .from("tabs")
            .update({
                header_row: activePreview.headerRowIndex + 1,
                last_synced_at: now,
                last_row_count: importedCount
            })
            .eq("id", activePreview.tab.id);

        if (tabUpdateError) throw tabUpdateError;

        const { error: sourceUpdateError } = await supabase
            .from("sources")
            .update({
                status: "healthy",
                last_synced_at: now
            })
            .eq("id", activePreview.source.id);

        if (sourceUpdateError) throw sourceUpdateError;

        const { error: runUpdateError } = await supabase
            .from("sync_runs")
            .update({
                status: "success",
                imported_rows: importedCount,
                completed_at: now
            })
            .eq("id", syncRunId);

        if (runUpdateError) throw runUpdateError;

        button.textContent = "Import Complete";

        alert(
            `Import completed successfully!\n\n` +
            `Imported or updated: ${importedCount}\n` +
            `Skipped rows: ${skippedRows}`
        );

        await loadConnectedSheets();

        window.dispatchEvent(
            new CustomEvent("linkify-sheets-updated")
        );

    } catch (error) {
        console.error("Import error:", error);

        if (syncRunId) {
            await supabase
                .from("sync_runs")
                .update({
                    status: "failed",
                    error_message: error.message,
                    completed_at: new Date().toISOString()
                })
                .eq("id", syncRunId);
        }

        alert("Import failed: " + error.message);

        button.disabled = false;
        button.textContent = "Confirm and Import All Records";
    }
}

// =====================================================
// MANUAL REFRESH / SYNC CONNECTED GOOGLE SHEET
// Reuses each tab's saved column mapping.
// =====================================================
async function refreshConnectedSheet(source, button) {
    const vendorName = source.vendors?.name || "this vendor";
    const confirmed = window.confirm(
        `Refresh the Google Sheet for ${vendorName}?\n\n` +
        "Latest data will be fetched from every selected tab. Existing records will be updated, new records added, and records removed from the sheet marked inactive. Saved column mappings will be reused."
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Refreshing...";

    let syncRunId = null;
    let totalRows = 0;
    let totalImported = 0;
    let totalSkipped = 0;

    try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error("Your login session has expired. Please log in again.");
                const { data: tabs, error: tabsError } = await supabase
            .from("tabs")
            .select("id, tab_name, sheet_gid, is_selected, is_enabled")
            .eq("source_id", source.id)
            .eq("is_selected", true)
            .eq("is_enabled", true)
            .order("created_at");
        if (tabsError) throw tabsError;
        if (!tabs?.length) throw new Error("No selected and enabled tabs found for this sheet.");

        const { data: syncRun, error: runError } = await supabase
            .from("sync_runs")
            .insert({
                source_id: source.id,
                status: "running",
                total_rows: 0,
                started_by: authData.user.id
            })
            .select()
            .single();
        if (runError) throw runError;
        syncRunId = syncRun.id;

        for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
            const tab = tabs[tabIndex];
            button.textContent = `Refreshing ${tabIndex + 1}/${tabs.length}: ${tab.tab_name}`;

            const { data: savedMappings, error: mappingError } = await supabase
                .from("column_mappings")
                .select("source_column_index, target_field")
                .eq("tab_id", tab.id)
                .eq("is_mapped", true);
            if (mappingError) throw mappingError;
            if (!savedMappings?.length) {
                throw new Error(`No saved column mapping for "${tab.tab_name}". Complete its first import using Preview Import.`);
            }

            const mapping = {};
            savedMappings.forEach(item => {
                if (item.target_field) mapping[String(item.source_column_index)] = item.target_field;
            });

            const mappedFields = Object.values(mapping);
            if (!mappedFields.includes("domain")) {
                throw new Error(`Saved mapping for "${tab.tab_name}" has no Domain / Website field.`);
            }
            if (new Set(mappedFields).size !== mappedFields.length) {
                throw new Error(`Saved mapping for "${tab.tab_name}" contains duplicate database fields. Correct it using Preview Import.`);
            }

            const rows = await fetchTabRows(source, tab);
            if (!rows.length) throw new Error(`The "${tab.tab_name}" tab is empty. No data was changed.`);

            const headerRowIndex = findHeaderRow(rows);
            if (headerRowIndex === -1) {
                throw new Error(`Could not detect the header row in "${tab.tab_name}". No data was changed for this tab.`);
            }

            const headers = rows[headerRowIndex].map((header, index) =>
                String(header || `Column ${index + 1}`).trim()
            );
            const dataRows = rows.slice(headerRowIndex + 1);
            totalRows += dataRows.length;

            const records = [];
            const importedRowNumbers = [];
            let skippedRows = 0;

            dataRows.forEach((row, index) => {
                const rawData = {};
                headers.forEach((header, columnIndex) => {
                    rawData[header] = row[columnIndex] ?? null;
                });

                const getValue = field => {
                    const columnIndex = Object.keys(mapping).find(key => mapping[key] === field);
                    return columnIndex === undefined ? null : row[Number(columnIndex)] ?? null;
                };

                const domain = cleanDomain(getValue("domain"));
                const normalizedDomain = normalizeDomain(domain);
                const rowNumber = index + headerRowIndex + 2;

                if (!domain || !normalizedDomain) {
                    skippedRows++;
                    return;
                }

                const usdValue = getValue("price_usd");
                const pkrValue = getValue("price_pkr");
                const selectedPrice = usdValue !== null && usdValue !== "" ? usdValue : pkrValue;
                const selectedCurrency = usdValue !== null && usdValue !== ""
                    ? "USD"
                    : pkrValue !== null && pkrValue !== "" ? "PKR" : null;

                records.push({
                    vendor_id: source.vendor_id,
                    tab_id: tab.id,
                    domain,
                    normalized_domain: normalizedDomain,
                    gp_pkr: parseNumber(pkrValue),
                    gp_usd: parseNumber(usdValue),
                    price: parseNumber(selectedPrice),
                    currency: selectedCurrency,
                    price_raw: selectedPrice === null || selectedPrice === undefined ? null : String(selectedPrice),
                    da: parseRangeNumber(getValue("da"), 0, 100),
                    dr: parseRangeNumber(getValue("dr"), 0, 100),
                    pa: parseNumber(getValue("pa")),
                    traffic: parseRangeNumber(getValue("traffic"), 0, Number.MAX_SAFE_INTEGER),
                    link_type: getValue("link_type") || null,
                    tat: getValue("tat") || null,
                    website_status: getValue("website_status") || null,
                    author_name: getValue("author_name") || null,
                    source_row_number: rowNumber,
                    raw_data: rawData,
                    is_active: true,
                    synced_at: new Date().toISOString()
                });
                importedRowNumbers.push(rowNumber);
            });

            for (let i = 0; i < records.length; i += 500) {
                const batch = records.slice(i, i + 500);
                button.textContent = `Refreshing ${tab.tab_name}: ${Math.min(i + batch.length, records.length).toLocaleString()} / ${records.length.toLocaleString()}`;
                const { error: upsertError } = await supabase
                    .from("listings")
                    .upsert(batch, { onConflict: "tab_id,source_row_number" });
                if (upsertError) throw upsertError;
            }

            // Deactivate records whose source rows no longer contain a valid domain.
            const { data: existingListings, error: existingError } = await supabase
                .from("listings")
                .select("id, source_row_number")
                .eq("tab_id", tab.id);
            if (existingError) throw existingError;

            const currentRows = new Set(importedRowNumbers);
            const staleIds = (existingListings || [])
                .filter(item => !currentRows.has(Number(item.source_row_number)))
                .map(item => item.id);

            for (let i = 0; i < staleIds.length; i += 500) {
                const { error: deactivateError } = await supabase
                    .from("listings")
                    .update({ is_active: false })
                    .in("id", staleIds.slice(i, i + 500));
                if (deactivateError) throw deactivateError;
            }

            const now = new Date().toISOString();
            const { error: tabUpdateError } = await supabase
                .from("tabs")
                .update({
                    header_row: headerRowIndex + 1,
                    last_synced_at: now,
                    last_row_count: records.length
                })
                .eq("id", tab.id);
            if (tabUpdateError) throw tabUpdateError;

            totalImported += records.length;
            totalSkipped += skippedRows;
        }

        const now = new Date().toISOString();
        const { error: sourceUpdateError } = await supabase
            .from("sources")
            .update({ status: "healthy", last_synced_at: now })
            .eq("id", source.id);
        if (sourceUpdateError) throw sourceUpdateError;

        const { error: runUpdateError } = await supabase
            .from("sync_runs")
            .update({
                status: "success",
                total_rows: totalRows,
                imported_rows: totalImported,
                completed_at: now
            })
            .eq("id", syncRunId);
        if (runUpdateError) throw runUpdateError;

        alert(
            `Sheet refreshed successfully!\n\nTabs refreshed: ${tabs.length}\nRecords added or updated: ${totalImported}\nRows skipped: ${totalSkipped}\n\nRecords removed from the sheet have been marked inactive.`
        );

        await loadConnectedSheets();
        window.dispatchEvent(new CustomEvent("linkify-sheets-updated"));

    } catch (error) {
        console.error("Google Sheet refresh error:", error);
        if (syncRunId) {
            await supabase.from("sync_runs").update({
                status: "failed",
                error_message: error.message,
                completed_at: new Date().toISOString()
            }).eq("id", syncRunId);
        }
        alert("Refresh failed: " + error.message);
        button.disabled = false;
        button.textContent = "Refresh Sheet";
    }
}

// =====================================================
// DELETE CONNECTED SHEET
// =====================================================
async function deleteConnectedSheet(sourceId, vendorName) {
    const confirmed = window.confirm(
        `Delete the Google Sheet connection for ${vendorName || "this vendor"}?\n\n` +
        "All linked tabs, imported listings and sync history will also be deleted."
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("sources")
        .delete()
        .eq("id", sourceId);

    if (error) {
        alert("Could not delete sheet: " + error.message);
        return;
    }

    alert("Google Sheet and linked data deleted successfully.");

    await loadConnectedSheets();

    window.dispatchEvent(
        new CustomEvent("linkify-sheets-updated")
    );
}

// =====================================================
// EVENTS
// =====================================================
connectForm.addEventListener("submit", event => {
    event.preventDefault();
    loadGoogleSheetTabs();
});

loadTabsButton.addEventListener("click", loadGoogleSheetTabs);
saveSheetButton.addEventListener("click", saveSheetConnection);

// =====================================================
// INITIALIZE
// =====================================================
async function initializeSheets() {
    await loadVendorOptions();
    await loadConnectedSheets();
}

initializeSheets();
