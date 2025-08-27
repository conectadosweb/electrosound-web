// ==== public/assets/js/login.js (Versión corregida) ====
import { showNotification } from "./ui.js";

// Función auxiliar para actualizar el texto del botón de login
const updateLoginButton = () => {
    const userName = localStorage.getItem("userName");
    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) {
        if (userName) {
            loginBtn.innerHTML = `<i class="fas fa-user"></i> ${userName}`;
            loginBtn.classList.add("logged-in");
        } else {
            loginBtn.innerHTML = `<i class="fas fa-user"></i> Ingresar`;
            loginBtn.classList.remove("logged-in");
        }
    }
};

/**
 * Función centralizada para cerrar la sesión del usuario de forma segura.
 */
function logoutUser() {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("isAdmin");

    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) {
        loginBtn.innerHTML = `<i class="fas fa-user"></i> Ingresar`;
        loginBtn.classList.remove("logged-in");
    }

    const cartCount = document.querySelector(".cart-count");
    if (cartCount) {
        cartCount.textContent = "0";
    }

    const cartModal = document.getElementById("cart-modal");
    if (cartModal) {
        cartModal.style.display = "none";
    }

    document.body.style.overflow = "auto";
    showNotification("Sesión cerrada correctamente", "success");

    window.location.reload();
}

/**
 * Abre el modal de la cuenta del usuario y carga sus datos.
 */
async function abrirModalCuenta() {
    const modal = document.getElementById("account-modal");
    if (!modal) return;
    document.body.style.overflow = "hidden";
    modal.style.display = "flex";
    const userEmail = localStorage.getItem("userEmail");
    const token = localStorage.getItem("jwtToken");
    if (!userEmail || !token) {
        showNotification("No hay usuario logueado o sesión expirada.", "error");
        modal.style.display = "none";
        document.body.style.overflow = "auto";
        return;
    }

    try {
        const res = await fetch(`/api/auth/${userEmail}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
        });
        const data = await res.json();
        if (res.ok && data.user) {
            const u = data.user;
            document.getElementById("account-nombre").value = u.nombre || "";
            document.getElementById("account-telefono").value = u.telefono || "";
            document.getElementById("account-nacimiento").value = u.nacimiento ? new Date(u.nacimiento).toISOString().split('T')[0] : "";
            document.getElementById("account-pais").value = u.pais || "";
        } else {
            showNotification(data.error || "Error al cargar tus datos", "error");
            if (res.status === 401 || res.status === 403) {
                logoutUser();
            }
            modal.style.display = "none";
            document.body.style.overflow = "auto";
        }
    } catch (error) {
        console.error("Error al cargar datos de la cuenta:", error);
        showNotification("Error al cargar tus datos", "error");
        modal.style.display = "none";
        document.body.style.overflow = "auto";
    }
}


document.addEventListener("DOMContentLoaded", () => {
    const loginOverlay = document.getElementById("login-overlay");
    const loginBtn = document.getElementById("login-btn");
    const authForm = document.getElementById("auth-form");
    const closeLogin = document.getElementById("close-login");
    const accountModal = document.getElementById("account-modal");
    const closeAccountModal = accountModal.querySelector(".close-modal");
    const accountForm = document.getElementById("account-form");
    const formTitle = document.getElementById("form-title");
    const extraFields = document.getElementById("extra-fields");
    const authFormButton = authForm.querySelector(".btn");
    const registerTextContainer = document.querySelector(".register-text");

    let isRegisterMode = false;

    updateLoginButton();

    loginBtn.addEventListener("click", () => {
        const userEmail = localStorage.getItem("userEmail");
        if (userEmail) {
            abrirModalCuenta();
        } else {
            loginOverlay.style.display = "flex";
            document.body.style.overflow = "hidden";
            isRegisterMode = false;
            updateFormContent();
        }
    });

    closeLogin.addEventListener("click", () => {
        loginOverlay.style.display = "none";
        document.body.style.overflow = "auto";
    });

    closeAccountModal.addEventListener("click", () => {
        accountModal.style.display = "none";
        document.body.style.overflow = "auto";
    });

    accountForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const userEmail = localStorage.getItem("userEmail");
        const token = localStorage.getItem("jwtToken");
        if (!userEmail || !token) {
            showNotification("No hay sesión iniciada o sesión expirada para actualizar datos.", "error");
            return;
        }

        const nombre = document.getElementById("account-nombre").value.trim();
        const telefono = document.getElementById("account-telefono").value.trim();
        const nacimiento = document.getElementById("account-nacimiento").value.trim();
        const pais = document.getElementById("account-pais").value.trim();
        const newPassword = document.getElementById("account-password").value.trim();

        const body = {
            nombre,
            telefono,
            nacimiento,
            pais,
        };

        if (newPassword) {
            if (newPassword.length < 8) {
                showNotification("La nueva contraseña debe tener al menos 8 caracteres", "error");
                return;
            }
            body.newPassword = newPassword;
        }

        try {
            const res = await fetch(`/api/auth/update`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (res.ok) {
                localStorage.setItem("userName", data.user?.nombre || nombre || "");
                showNotification("Datos actualizados correctamente", "success");
                accountModal.style.display = "none";
                document.body.style.overflow = "auto";
                updateLoginButton();
                document.dispatchEvent(new CustomEvent('userNameUpdated', {
                    detail: { name: localStorage.getItem("userName") }
                }));

            } else {
                showNotification(data.error || "Error al actualizar los datos", "error");
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                }
            }
        } catch (error) {
            console.error("Error al conectar con el servidor para actualizar:", error);
            showNotification("Error al conectar con el servidor", "error");
        }
    });

    const updateFormContent = () => {
        formTitle.textContent = isRegisterMode ? "Registro" : "Iniciar Sesión";
        authFormButton.textContent = isRegisterMode ? "Registrarse" : "Ingresar";
        extraFields.style.display = isRegisterMode ? "block" : "none";
        registerTextContainer.innerHTML = isRegisterMode
            ? '¿Ya tienes cuenta? <a href="#" id="toggle-mode-link">Inicia sesión</a>'
            : '¿No tienes cuenta? <a href="#" id="toggle-mode-link">Regístrate</a>';

        const toggleModeLink = document.getElementById("toggle-mode-link");
        if (toggleModeLink) {
            toggleModeLink.addEventListener("click", (e) => {
                e.preventDefault();
                isRegisterMode = !isRegisterMode;
                updateFormContent();
            });
        }
    };

    updateFormContent();

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();

        if (!email || !password) {
            showNotification("Completá todos los campos requeridos", "error");
            return;
        }

        const url = isRegisterMode ? "/api/auth/register" : "/api/auth/login";
        const body = { email, password };

        if (isRegisterMode) {
            const nombre = document.getElementById("nombre").value.trim();
            const confirmPassword = document.getElementById("confirmPassword").value.trim();
            const telefono = document.getElementById("telefono").value.trim();
            const nacimiento = document.getElementById("nacimiento").value.trim();
            const pais = document.getElementById("pais").value.trim();

            if (!nombre || !confirmPassword || !telefono) {
                showNotification("Completá todos los campos obligatorios del formulario", "error");
                return;
            }
            if (password !== confirmPassword) {
                showNotification("Las contraseñas no coinciden", "error");
                return;
            }
            if (password.length < 8) {
                showNotification("La contraseña debe tener al menos 8 caracteres", "error");
                return;
            }
            Object.assign(body, { nombre, confirmPassword, telefono, nacimiento, pais });
        }

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("userEmail", body.email);
                localStorage.setItem("userName", data.user?.nombre || body.nombre || ""); 
                if (data.token) {
                    localStorage.setItem("jwtToken", data.token);
                }
                if (data.user && typeof data.user.esAdmin !== 'undefined') {
                    // CORRECCIÓN: Guardar el valor booleano como un número
                    localStorage.setItem("isAdmin", data.user.esAdmin ? 1 : 0);
                }
                showNotification(
                    isRegisterMode ? "Registro exitoso. Ahora podés iniciar sesión" : "Sesión iniciada correctamente",
                    "success"
                );
                if (!isRegisterMode) {
                    loginOverlay.style.display = "none";
                    document.body.style.overflow = "auto";
                    document.dispatchEvent(new CustomEvent('userLoggedIn', {
                        detail: { 
                            email: localStorage.getItem("userEmail"), 
                            name: localStorage.getItem("userName"),
                            // CORRECCIÓN: Comparar con la cadena "1"
                            isAdmin: localStorage.getItem("isAdmin") === "1"
                        }
                    }));
                } else {
                    isRegisterMode = false; 
                    updateFormContent();
                }
                updateLoginButton(); 
            } else {
                showNotification(data.error || "Error de autenticación", "error"); 
            }
        } catch (error) {
            console.error("Error en la solicitud de autenticación:", error);
            showNotification("Error al conectar con el servidor", "error");
        }
    });
});