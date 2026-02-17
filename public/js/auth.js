// Quick login handler - Must be global
function quickLogin(role) {
    const user = {
        id: role === 'admin' ? 1 : 2,
        email: role === 'admin' ? 'admin@paneer.com' : 'delivery@paneer.com',
        role: role
    };

    localStorage.setItem('user', JSON.stringify(user));
    showNotification(`Welcome ${role.toUpperCase()}`, 'success');

    setTimeout(() => {
        if (role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'delivery.html';
        }
    }, 500);
}

// Keep listener for backward compatibility if form exists (though it was removed)
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // ... legacy code ...
        });
    }
});
