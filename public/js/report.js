document.addEventListener('DOMContentLoaded', () => {
    checkAuth('admin');
    loadReport();
});

async function loadReport() {
    try {
        const res = await fetch('/api/report');
        const data = await res.json();

        // Use animation for numbers
        animateValue(document.getElementById('total-sold'), 0, data.total_sold, 1000);
        animateValue(document.getElementById('total-revenue'), 0, data.total_revenue, 1000); // Note: animateValue mainly for ints, format below
        document.getElementById('total-revenue').innerText = formatCurrency(data.total_revenue);

        document.getElementById('batches-count').innerText = data.batches_count;
        document.getElementById('pending-amount').innerText = formatCurrency(data.pending_amount);
        document.getElementById('stock-remaining').innerText = `${data.current_stock} KG`;
    } catch (err) {
        console.error("Error loading report", err);
    }
}
