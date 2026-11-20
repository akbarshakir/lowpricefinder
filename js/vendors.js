
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
    initializeVendors();
});

let editingVendorId = null;

async function initializeVendors() {
    const vendorForm = document.getElementById("vendorForm");
    const showVendorForm = document.getElementById("showVendorForm");
    const cancelVendor = document.getElementById("cancelVendor");

    if (vendorForm) {
        vendorForm.addEventListener("submit", saveVendor);
    }

    if (showVendorForm) {
        showVendorForm.addEventListener("click", () => {
            resetVendorForm();
            showForm();
        });
    }

    if (cancelVendor) {
        cancelVendor.addEventListener("click", hideForm);
    }

    await loadVendors();
}

async function loadVendors() {
    const tableBody = document.getElementById("vendorTableBody");

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="5">Loading vendors...</td>
        </tr>
    `;

    const { data: vendors, error } = await supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Vendor loading error:", error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5">Could not load vendors.</td>
            </tr>
        `;
        return;
    }

    if (!vendors || vendors.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5">No vendors added yet.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = "";

    for (const vendor of vendors) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = vendor.name;

        const notesCell = document.createElement("td");
        notesCell.textContent = vendor.notes || "-";

        const statusCell = document.createElement("td");
        const status = document.createElement("span");

        status.textContent = vendor.is_enabled ? "Active" : "Disabled";
        status.className = vendor.is_enabled
            ? "status-active"
            : "status-disabled";

        statusCell.appendChild(status);

        const dateCell = document.createElement("td");
        dateCell.textContent = vendor.created_at
            ? new Date(vendor.created_at).toLocaleDateString()
            : "-";

        const actionsCell = document.createElement("td");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.className = "table-action";
        editButton.addEventListener("click", () => {
            editVendor(vendor);
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.className = "table-action delete-action";
        deleteButton.addEventListener("click", () => {
            deleteVendor(vendor.id, vendor.name);
        });

        actionsCell.append(editButton, deleteButton);

        row.append(
            nameCell,
            notesCell,
            statusCell,
            dateCell,
            actionsCell
        );

        tableBody.appendChild(row);
    }
}

async function saveVendor(event) {
    event.preventDefault();

    const nameInput = document.getElementById("vendorName");
    const notesInput = document.getElementById("vendorNotes");
    const saveButton = document.getElementById("saveVendor");

    const name = nameInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name) {
        showMessage("Please enter vendor name.", true);
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        if (editingVendorId) {
            const { error } = await supabase
                .from("vendors")
                .update({
                    name,
                    notes
                })
                .eq("id", editingVendorId);

            if (error) throw error;

            showMessage("Vendor updated successfully.");

        } else {
            const {
                data: { user },
                error: authError
            } = await supabase.auth.getUser();

            if (authError || !user) {
                throw new Error("Please login again.");
            }

            const { error } = await supabase
                .from("vendors")
                .insert({
                    name,
                    notes,
                    created_by: user.id
                });

            if (error) throw error;

            showMessage("Vendor added successfully.");
        }

        resetVendorForm();
        hideForm();
        await loadVendors();

    } catch (error) {
        console.error("Vendor save error:", error);

        if (error.code === "23505") {
            showMessage("This vendor already exists.", true);
        } else {
            showMessage(error.message || "Something went wrong.", true);
        }

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Vendor";
    }
}

function editVendor(vendor) {
    editingVendorId = vendor.id;

    document.getElementById("vendorName").value = vendor.name || "";
    document.getElementById("vendorNotes").value = vendor.notes || "";

    const formTitle = document.getElementById("vendorFormTitle");

    if (formTitle) {
        formTitle.textContent = "Edit Vendor";
    }

    const saveButton = document.getElementById("saveVendor");

    if (saveButton) {
        saveButton.textContent = "Update Vendor";
    }

    showForm();
}

async function deleteVendor(vendorId, vendorName) {
    const confirmed = window.confirm(
        `Are you sure you want to delete "${vendorName}"? Related vendor data may also be deleted.`
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from("vendors")
            .delete()
            .eq("id", vendorId);

        if (error) throw error;

        showMessage("Vendor deleted successfully.");
        await loadVendors();

    } catch (error) {
        console.error("Vendor delete error:", error);
        showMessage(error.message || "Could not delete vendor.", true);
    }
}

function resetVendorForm() {
    editingVendorId = null;

    const form = document.getElementById("vendorForm");

    if (form) {
        form.reset();
    }

    const formTitle = document.getElementById("vendorFormTitle");

    if (formTitle) {
        formTitle.textContent = "Add New Vendor";
    }

    const saveButton = document.getElementById("saveVendor");

    if (saveButton) {
        saveButton.textContent = "Save Vendor";
    }
}

function showForm() {
    const form = document.getElementById("vendorForm");

    if (form) {
        form.classList.remove("hidden");
    }
}

function hideForm() {
    const form = document.getElementById("vendorForm");

    if (form) {
        form.classList.add("hidden");
    }

    resetVendorForm();
}

function showMessage(message, isError = false) {
    const messageElement = document.getElementById("vendorMessage");

    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.style.color = isError ? "#c0392b" : "#287a45";
}
