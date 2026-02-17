document.addEventListener('DOMContentLoaded', async () => {
    checkAuth('admin');
    const stockData = await loadStock();

    // Auto calculate totals in form
    // Pre-fill valid default selling price
    const sellingPriceInput = document.getElementById('sellingPrice');
    if (stockData && stockData.selling_price_per_kg) {
        sellingPriceInput.value = stockData.selling_price_per_kg;
    }

    // Auto calculate totals in form
    const qtyInput = document.getElementById('orderQty');
    const totalDisplay = document.getElementById('orderTotal');

    function calculateTotal() {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(sellingPriceInput.value) || 0;
        const total = qty * price;
        totalDisplay.value = formatCurrency(total);
    }

    qtyInput.addEventListener('input', calculateTotal);
    sellingPriceInput.addEventListener('input', calculateTotal);

    const form = document.getElementById('orderForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const orderData = {
            customer_name: document.getElementById('customerName').value,
            shop_name: document.getElementById('shopName').value,
            type: document.getElementById('orderType').value,
            quantity: document.getElementById('orderQty').value,
            selling_price: document.getElementById('sellingPrice').value,
            delivery_time: document.getElementById('deliveryTime').value
        };

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const data = await res.json();
            if (data.success) {
                showNotification('Order Created!', 'success');
                form.reset();
                // Reset price to default
                if (stockData) sellingPriceInput.value = stockData.selling_price_per_kg;
                loadOrders(); // Refresh table
            } else {
                showNotification(data.error, 'error');
            }
        } catch (err) {
            showNotification('Error creating order', 'error');
        }
    });

    loadOrders();
});

async function loadOrders() {
    const res = await fetch('/api/orders?status=Pending');
    const orders = await res.json();

    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = '';

    orders.forEach(order => {
        const row = `
            <tr>
                <td>#${order.id}</td>
                <td>${order.customer_name} ${order.shop_name ? `(${order.shop_name})` : ''}</td>
                <td>${order.type}</td>
                <td>${order.quantity} KG</td>
                <td>${formatCurrency(order.total_amount)}</td>
                <td>${formatDate(order.delivery_time)}</td>
                <td><span style="color:var(--neon-red)">${order.status}</span></td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}
