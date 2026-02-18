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

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            // Get role from clicked button (set via inline script) or hidden input
            const role = document.getElementById('selectedRole').value || 'admin';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (data.success) {
                    if (data.user.role !== role) {
                        showNotification('Invalid role selected for this user', 'error');
                        return;
                    }

                    localStorage.setItem('user', JSON.stringify(data.user));
                    showNotification('Login Successful', 'success');

                    setTimeout(() => {
                        window.location.href = role === 'admin' ? 'admin-dashboard.html' : 'delivery.html';
                    }, 1000);
                } else {
                    showNotification(data.message, 'error');
                }
            } catch (err) {
                showNotification('Login error', 'error');
            }
        });
    }
});
