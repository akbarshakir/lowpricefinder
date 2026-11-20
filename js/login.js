
import { supabase } from "./supabase.js";

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";
    loginMessage.textContent = "";

    try {
        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) throw error;

        const userId = data.user.id;

        const { data: profile, error: profileError } =
            await supabase
                .from("profiles")
                .select("role, is_active")
                .eq("id", userId)
                .single();

        if (profileError) throw profileError;

        if (profile.role !== "admin" || !profile.is_active) {
            await supabase.auth.signOut();
            throw new Error("You are not authorized as an active admin.");
        }

        loginMessage.style.color = "green";
        loginMessage.textContent = "Login successful!";

        window.location.href = "index.html";

    } catch (error) {
        loginMessage.style.color = "red";
        loginMessage.textContent = error.message;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
    }
});
