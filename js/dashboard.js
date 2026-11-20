
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    await initializeDashboard();
});

async function initializeDashboard() {
    try {
        // Check logged-in user
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return;
        }

        // Verify admin access
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role, is_active")
            .eq("id", user.id)
            .single();

        if (
            profileError ||
            !profile ||
            profile.role !== "admin" ||
            profile.is_active !== true
        ) {
            await supabase.auth.signOut();
            window.location.href = "login.html";
            return;
        }

        // Display admin email
        const adminEmail = document.getElementById("adminEmail");

        if (adminEmail) {
            adminEmail.textContent = user.email || "Admin";
        }

        // Load dashboard statistics
        await loadDashboardStats();

    } catch (error) {
        console.error("Dashboard initialization error:", error);
    }
}

async function loadDashboardStats() {
    try {
        const [
            vendorsResult,
            sourcesResult,
            listingsResult,
            activeListingsResult
        ] = await Promise.all([
            supabase
                .from("vendors")
                .select("id", { count: "exact", head: true }),

            supabase
                .from("sources")
                .select("id", { count: "exact", head: true }),

            supabase
                .from("listings")
                .select("id", { count: "exact", head: true }),

            supabase
                .from("listings")
                .select("id", { count: "exact", head: true })
                .eq("is_active", true)
        ]);

        if (vendorsResult.error) throw vendorsResult.error;
        if (sourcesResult.error) throw sourcesResult.error;
        if (listingsResult.error) throw listingsResult.error;
        if (activeListingsResult.error) throw activeListingsResult.error;

        updateStat("vendorCount", vendorsResult.count);
        updateStat("sheetCount", sourcesResult.count);
        updateStat("listingCount", listingsResult.count);
        updateStat("activeCount", activeListingsResult.count);

    } catch (error) {
        console.error("Could not load dashboard statistics:", error);
    }
}

function updateStat(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
        element.textContent = value ?? 0;
    }
}
