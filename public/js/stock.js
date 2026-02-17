async function loadStock() {
    try {
        const response = await fetch('/api/stock');
        const stock = await response.json();

        const stockEl = document.getElementById('stock-display');
        if (stockEl) {
            stockEl.textContent = `${stock.current_stock} KG`;

            if (stock.current_stock < 20) {
                stockEl.classList.add('low-stock-alert');
                stockEl.innerHTML += ` <span style="font-size:0.5em">⚠ LOW STOCK</span>`;
            } else {
                stockEl.classList.remove('low-stock-alert');
            }
        }

        const priceEl = document.getElementById('price-display');
        if (priceEl) {
            priceEl.textContent = formatCurrency(stock.selling_price_per_kg);
        }

        return stock; // Return for reuse
    } catch (err) {
        console.error('Failed to load stock', err);
    }
}
