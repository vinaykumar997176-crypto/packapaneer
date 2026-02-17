document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth(); // Works for both, but we typically expect delivery or admin here
    loadPendingDeliveries();
});

async function loadPendingDeliveries() {
    const res = await fetch('/api/orders?status=Pending');
    const orders = await res.json();

    const container = document.getElementById('deliveryCards');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = '<div style="text-align:center;width:100%">No pending deliveries 🎉</div>';
        showNotification('All Deliveries Completed Successfully', 'success');
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'card fade-in';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                    <h3>#${order.id} - ${order.customer_name}</h3>
                    <p>${order.shop_name || 'Consumer'}</p>
                    <p style="color:var(--neon-green)">${order.quantity} KG</p>
                </div>
                <div style="text-align:right">
                    <p>${formatDate(order.delivery_time)}</p>
                    <p style="font-weight:bold;font-size:1.2em">${formatCurrency(order.total_amount)}</p>
                </div>
            </div>
            <div style="margin-top:20px;display:flex;gap:10px">
                <select id="payMode-${order.id}" style="flex:1">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Credit">Credit</option>
                </select>
                <button class="btn btn-primary" onclick="deliverOrder(${order.id}, ${order.quantity})">Deliver</button>
            </div>
        `;
        container.appendChild(card);
    });
}

window.deliverOrder = async (orderId, qty) => {
    const payMode = document.getElementById(`payMode-${orderId}`).value;

    if (!confirm(`Confirm delivery for Order #${orderId}?`)) return;

    try {
        const res = await fetch('/api/deliver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, paymentMode: payMode })
        });

        const data = await res.json();
        if (data.success) {
            showNotification('Delivery Successful! 🚚', 'success');
            loadPendingDeliveries();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        showNotification('Error confirming delivery', 'error');
    }
};
