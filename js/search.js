
import { supabase } from "./supabase.js";

// =====================================================
// SEARCH INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    const searchButton = document.getElementById("searchButton");
    const searchInput = document.getElementById("domainSearch");
    const clearSearchButton = document.getElementById("clearSearchButton");

    if (!searchButton || !searchInput) {
        console.error("Domain search elements not found.");
        return;
    }

    searchButton.addEventListener("click", searchDomain);

    // Clear Search
    if (clearSearchButton) {
        clearSearchButton.hidden = !searchInput.value;

        clearSearchButton.addEventListener("click", () => {
            searchInput.value = "";

            const results = document.getElementById("searchResults");
            if (results) results.innerHTML = "";

            clearSearchButton.hidden = true;
            searchInput.focus();
        });

        searchInput.addEventListener("input", () => {
            clearSearchButton.hidden = searchInput.value.length === 0;
        });
    }

    // Enter key search
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchDomain();
        }
    });
});

// =====================================================
// DOMAIN NORMALIZATION
// =====================================================

function normalizeDomain(value) {
    let domain = String(value || "").trim().toLowerCase();

    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.replace(/^www\./, "");
    domain = domain.split("/")[0];
    domain = domain.split("?")[0];
    domain = domain.split("#")[0];

    return domain;
}

// =====================================================
// ORIGINAL GOOGLE SHEET URL
// =====================================================

function createOriginalSheetUrl(source, tab, rowNumber) {
    if (!source) return null;

    let sheetUrl = source.sheet_url || "";

    if (source.spreadsheet_id) {
        sheetUrl =
            `https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}/edit`;
    }

    if (!sheetUrl) return null;

    try {
        const url = new URL(sheetUrl);

        const hashParts = [];

        if (tab && tab.sheet_gid !== null && tab.sheet_gid !== undefined) {
            hashParts.push(`gid=${tab.sheet_gid}`);
        }

        if (rowNumber !== null && rowNumber !== undefined) {
            const row = Number(rowNumber);

            if (Number.isInteger(row) && row > 0) {
                hashParts.push(`range=A${row}`);
            }
        }

        if (hashParts.length > 0) {
            url.hash = hashParts.join("&");
        }

        return url.toString();

    } catch (error) {
        console.error("Invalid Google Sheet URL:", error);
        return null;
    }
}

// =====================================================
// SEARCH DOMAIN
// =====================================================

async function searchDomain() {
    const input = document.getElementById("domainSearch");
    const button = document.getElementById("searchButton");
    const results = document.getElementById("searchResults");
    const clearButton = document.getElementById("clearSearchButton");

    const domain = normalizeDomain(input.value);

    if (!domain) {
        results.textContent = "Please enter a domain name.";
        return;
    }

    button.disabled = true;
    button.textContent = "Searching...";
    results.textContent = "Searching across vendors...";

    if (clearButton) {
        clearButton.hidden = false;
    }

    try {

        // -------------------------------------------------
        // GET LISTINGS
        // -------------------------------------------------

        const { data: listings, error } = await supabase
            .from("listings")
            .select(`
                id,
                vendor_id,
                tab_id,
                source_row_number,
                domain,
                normalized_domain,
                price,
                currency,
                price_raw,
                da,
                dr,
                pa,
                traffic,
                link_type,
                tat,
                website_status,
                gp_pkr,
                gp_usd,
                li_pkr
            `)
            .eq("normalized_domain", domain)
            .eq("is_active", true);

        if (error) throw error;

        if (!listings || listings.length === 0) {
            results.textContent = `No active offers found for ${domain}.`;
            return;
        }

        // -------------------------------------------------
        // GET VENDORS
        // -------------------------------------------------

        const vendorIds = [
            ...new Set(
                listings
                    .map(item => item.vendor_id)
                    .filter(Boolean)
            )
        ];

        const { data: vendors, error: vendorError } = await supabase
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds);

        if (vendorError) throw vendorError;

        const vendorMap = new Map(
            (vendors || []).map(vendor => [
                vendor.id,
                vendor.name
            ])
        );

        // -------------------------------------------------
        // GET TABS
        // -------------------------------------------------

        const tabIds = [
            ...new Set(
                listings
                    .map(item => item.tab_id)
                    .filter(Boolean)
            )
        ];

        let tabMap = new Map();
        let sourceMap = new Map();

        if (tabIds.length > 0) {

            const { data: tabs, error: tabError } = await supabase
                .from("tabs")
                .select("id, tab_name, sheet_gid, source_id")
                .in("id", tabIds);

            if (tabError) throw tabError;

            tabMap = new Map(
                (tabs || []).map(tab => [
                    tab.id,
                    tab
                ])
            );

            // ---------------------------------------------
            // GET ORIGINAL SHEETS
            // ---------------------------------------------

            const sourceIds = [
                ...new Set(
                    (tabs || [])
                        .map(tab => tab.source_id)
                        .filter(Boolean)
                )
            ];

            if (sourceIds.length > 0) {

                const { data: sources, error: sourceError } = await supabase
                    .from("sources")
                    .select(`
                        id,
                        sheet_url,
                        spreadsheet_id,
                        spreadsheet_title
                    `)
                    .in("id", sourceIds);

                if (sourceError) throw sourceError;

                sourceMap = new Map(
                    (sources || []).map(source => [
                        source.id,
                        source
                    ])
                );
            }
        }

        // -------------------------------------------------
        // DISPLAY RESULTS
        // -------------------------------------------------

        results.innerHTML = "";

        const heading = document.createElement("h3");

        heading.textContent =
            `${listings.length} offers found for ${domain}`;

        results.appendChild(heading);

        const tableWrap = document.createElement("div");
        tableWrap.className = "search-results-wrap";

        const table = document.createElement("table");
        table.className = "search-results-table";

        const headers = [
            "Vendor",
            "Domain",
            "Original Price",
            "GP PKR",
            "GP USD",
            "LI PKR",
            "DA",
            "DR",
            "PA",
            "Traffic",
            "Link Type",
            "TAT",
            "Original Sheet"
        ];

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        headers.forEach(header => {
            const th = document.createElement("th");
            th.textContent = header;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        listings.forEach(item => {

            const row = document.createElement("tr");

            const values = [
                vendorMap.get(item.vendor_id) || "Unknown Vendor",
                item.domain || "-",

                item.price_raw || (
                    item.price !== null
                        ? `${item.price} ${item.currency || ""}`
                        : "-"
                ),

                item.gp_pkr ?? "-",
                item.gp_usd ?? "-",
                item.li_pkr ?? "-",
                item.da ?? "-",
                item.dr ?? "-",
                item.pa ?? "-",
                item.traffic ?? "-",
                item.link_type || "-",
                item.tat || "-"
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            });

            // ---------------------------------------------
            // VIEW ORIGINAL SHEET BUTTON
            // ---------------------------------------------

            const sheetCell = document.createElement("td");

            const tab = tabMap.get(item.tab_id);

            const source = tab
                ? sourceMap.get(tab.source_id)
                : null;

            const originalUrl = createOriginalSheetUrl(
                source,
                tab,
                item.source_row_number
            );

            if (originalUrl) {

                const linkButton = document.createElement("a");

                linkButton.href = originalUrl;
                linkButton.target = "_blank";
                linkButton.rel = "noopener noreferrer";

                linkButton.textContent = "View Original Sheet";

                linkButton.className = "view-sheet-button";

                linkButton.style.display = "inline-block";
                linkButton.style.padding = "7px 10px";
                linkButton.style.backgroundColor = "#2563eb";
                linkButton.style.color = "#ffffff";
                linkButton.style.borderRadius = "5px";
                linkButton.style.textDecoration = "none";
                linkButton.style.whiteSpace = "nowrap";
                linkButton.style.fontSize = "12px";

                sheetCell.appendChild(linkButton);

            } else {

                sheetCell.textContent = "Sheet unavailable";

            }

            row.appendChild(sheetCell);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        results.appendChild(tableWrap);

    } catch (error) {

        console.error("Domain search error:", error);

        results.textContent =
            `Search failed: ${error.message}`;

    } finally {

        button.disabled = false;
        button.textContent = "Search Domain";

    }
}
