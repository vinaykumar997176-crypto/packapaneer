document.addEventListener('DOMContentLoaded', () => {
    checkAuth('admin');
    loadStock();

    // Set auto date
    document.getElementById('batchDate').value = new Date().toISOString().slice(0, 16);

    const form = document.getElementById('batchForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const quantity = document.getElementById('quantity').value;
        const purchase_price = document.getElementById('purchasePrice').value;
        const timestamp = document.getElementById('batchDate').value;

        try {
            const res = await fetch('/api/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, purchase_price, timestamp })
            });

            const data = await res.json();
            if (data.success) {
                showNotification('Batch Received Successfully!', 'success');
                form.reset();
                document.getElementById('batchDate').value = new Date().toISOString().slice(0, 16);
                loadStock(); // Update displayed stock
            } else {
                showNotification(data.error, 'error');
            }
        } catch (err) {
            showNotification('Error submitting batch', 'error');
        }
    });
});
