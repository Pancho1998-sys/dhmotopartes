/* ==========================================================================
   DHMotopartes - Dynamic Components Module
   ========================================================================== */

/**
 * Renders an interactive SVG line chart showing recent sales trends.
 * @param {string} containerId - ID of the container element
 * @param {Array<{date: string, total: number}>} data - Sales data for last 7 days
 * @param {string} currency - Currency symbol
 */
function renderSalesChart(containerId, data, currency = '$') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <i data-lucide="bar-chart-3"></i>
                <p>Sin datos de ventas disponibles para graficar.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const width = 600;
    const height = 240;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 30;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Find min and max totals
    const totals = data.map(d => d.total);
    const maxVal = Math.max(...totals, 100); // Guard against divide-by-zero or flat 0 values
    const minVal = 0;

    // Generate Points
    const points = data.map((item, index) => {
        const x = paddingLeft + (index * (chartWidth / (data.length - 1 || 1)));
        // Map y (SVG coordinates start from top-left, so we subtract from height)
        const y = paddingTop + chartHeight - ((item.total / maxVal) * chartHeight);
        return { x, y, value: item.total, date: item.date };
    });

    // Create polyline coordinates string
    const linePointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
    
    // Create fill path points string (closing the loop at the bottom)
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const fillPointsStr = `${firstPoint.x},${paddingTop + chartHeight} ${linePointsStr} ${lastPoint.x},${paddingTop + chartHeight}`;

    // Generate Y grid lines values
    const gridLines = [];
    const divisions = 4;
    for (let i = 0; i <= divisions; i++) {
        const val = minVal + (maxVal - minVal) * (i / divisions);
        const y = paddingTop + chartHeight - ((val / maxVal) * chartHeight);
        gridLines.push({ y, value: val });
    }

    // SVG templates
    let svgHtml = `
        <svg viewBox="0 0 ${width} ${height}" class="sales-svg-chart" style="width:100%; height:100%; overflow:visible;">
            <defs>
                <linearGradient id="chart-fill-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0" />
                </linearGradient>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="var(--primary)" flood-opacity="0.2"/>
                </filter>
            </defs>
            
            <!-- Grid Lines & Y Axis Labels -->
            <g class="chart-grid">
    `;

    gridLines.forEach(line => {
        svgHtml += `
            <line x1="${paddingLeft}" y1="${line.y}" x2="${width - paddingRight}" y2="${line.y}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4,4" />
            <text x="${paddingLeft - 10}" y="${line.y + 4}" fill="var(--text-muted)" font-size="11" font-weight="500" font-family="var(--font-body)" text-anchor="end">${currency}${line.value.toFixed(0)}</text>
        `;
    });

    svgHtml += `</g>
            
            <!-- Area Gradient Fill -->
            <polygon points="${fillPointsStr}" fill="url(#chart-fill-gradient)" />
            
            <!-- Main Polyline Stroke -->
            <polyline points="${linePointsStr}" fill="none" stroke="var(--primary)" stroke-width="3" filter="url(#shadow)" stroke-linecap="round" stroke-linejoin="round" />
            
            <!-- X Axis Labels -->
            <g class="chart-axis-x">
    `;

    points.forEach(p => {
        svgHtml += `
            <text x="${p.x}" y="${height - paddingBottom + 22}" fill="var(--text-muted)" font-size="11.5" font-weight="600" font-family="var(--font-title)" text-anchor="middle">${p.date}</text>
        `;
    });

    svgHtml += `</g>
            
            <!-- Data Interactive Circles -->
            <g class="chart-dots">
    `;

    points.forEach(p => {
        svgHtml += `
            <g class="chart-dot-group">
                <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--bg-card)" stroke="var(--primary)" stroke-width="3" class="chart-marker-dot" style="cursor:pointer; transition: r 0.15s ease;" />
                <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent" style="cursor:pointer;" onmouseenter="showChartTooltip(event, '${currency}${p.value.toFixed(2)}')" onmouseleave="hideChartTooltip()" />
            </g>
        `;
    });

    svgHtml += `
            </g>
        </svg>
        <div id="chart-tooltip" class="chart-tooltip-el" style="position: absolute; display: none; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 5px 10px; font-size: 11px; font-weight: bold; color: #fff; pointer-events: none; transform: translate(-50%, -100%); margin-top: -10px; box-shadow: var(--shadow-md); z-index: 10;"></div>
    `;

    container.innerHTML = svgHtml;
}

// Global functions for SVG tooltip handling
window.showChartTooltip = function(event, text) {
    const tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) return;
    
    // Find container bounding client
    const container = tooltip.parentElement;
    const rect = container.getBoundingClientRect();
    
    // Calculate relative coordinates
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    
    // Animate target circle
    const group = event.target.parentElement;
    const dot = group.querySelector('.chart-marker-dot');
    if (dot) dot.setAttribute('r', '7');
};

window.hideChartTooltip = function() {
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    
    const dots = document.querySelectorAll('.chart-marker-dot');
    dots.forEach(d => d.setAttribute('r', '5'));
};

/**
 * Creates HTML for a product card inside the POS catalog grid.
 * @param {Object} product - The product object
 * @param {string} currency - Store currency symbol
 * @returns {string} HTML string
 */
function createPOSProductCard(product, currency = '$') {
    const isOutOfStock = product.stock <= 0;
    const cardClass = isOutOfStock ? 'prod-card out-of-stock' : 'prod-card';
    
    let stockClass = 'stock-badge-ok';
    let stockText = `${product.stock} disp.`;
    
    if (product.stock <= 0) {
        stockClass = 'stock-badge-out';
        stockText = 'Agotado';
    } else if (product.stock <= product.stockMin) {
        stockClass = 'stock-badge-low';
        stockText = 'Stock Bajo';
    }

    // Fallback image helper
    const imagePlaceholder = product.image ? 
        `<img src="${product.image}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);" onerror="this.innerHTML='<i data-lucide=\\'image\\'></i>'; this.style.display='none'; this.nextElementSibling.style.display='block';">` : '';
    
    const iconStyle = product.image ? 'display: none;' : '';

    return `
        <div class="${cardClass}" data-id="${product.id}" onclick="${isOutOfStock ? '' : `addCartItem('${product.id}')`}">
            <span class="prod-card-sku">${product.sku}</span>
            <div class="prod-card-image">
                ${imagePlaceholder}
                <div class="fallback-icon" style="${iconStyle}">
                    <i data-lucide="${product.category === 'Herramientas' ? 'wrench' : 'package'}"></i>
                </div>
            </div>
            <div class="prod-card-info">
                <span class="prod-card-cat">${product.category}</span>
                <h4 class="prod-card-title" title="${product.name}">${product.name}</h4>
                <div class="prod-card-footer">
                    <span class="prod-card-price">${currency}${product.price.toFixed(2)}</span>
                    <span class="prod-card-stock ${stockClass}">${stockText}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generates the thermal ticket HTML structure.
 * @param {Object} sale - Sale transaction data
 * @param {Object} settings - Store settings
 * @returns {string} HTML string
 */
function renderReceipt(sale, settings) {
    const currency = settings.currency || '$';
    
    // Render custom logo if set
    const logoHtml = settings.logo ? `
        <div style="text-align: center; margin-bottom: 10px;">
            <img src="${settings.logo}" style="max-height: 50px; max-width: 150px; object-fit: contain;" alt="Logo">
        </div>
    ` : '';
    
    let itemsRows = '';
    sale.items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        itemsRows += `
            <tr>
                <td colspan="3">${item.name}</td>
            </tr>
            <tr>
                <td style="padding-left: 10px;">${item.quantity} x ${currency}${item.price.toFixed(2)}</td>
                <td style="text-align: right;">${currency}${itemTotal.toFixed(2)}</td>
            </tr>
        `;
    });

    const subtotal = sale.subtotal;
    const tax = sale.tax;
    const discount = sale.discount;
    const total = sale.total;
    
    // Status header for voided transactions
    const voidedHeader = sale.status === 'voided' ? `
        <div style="border: 2px solid #ef4444; color: #ef4444; padding: 6px; text-align: center; font-weight: bold; margin-bottom: 12px; font-size: 14px;">
            !!! VENTA ANULADA !!!<br>
            REMBOLSO PROCESADO
        </div>
    ` : '';

    return `
        <div class="ticket-wrapper">
            ${voidedHeader}
            <div class="ticket-header">
                ${logoHtml}
                <div class="ticket-title">${settings.storeName}</div>
                <div style="font-size: 11px;">${settings.storeAddress}</div>
                <div style="font-size: 11px;">Tel: ${settings.storePhone}</div>
            </div>
            
            <div class="ticket-info">
                <div><strong>Folio:</strong> ${sale.id}</div>
                <div><strong>Fecha:</strong> ${new Date(sale.date).toLocaleString('es-ES')}</div>
                <div><strong>Cliente:</strong> ${sale.customerName || 'Consumidor Final'}</div>
                <div><strong>Atendido por:</strong> Administrador</div>
            </div>
            
            <hr class="ticket-divider">
            
            <table class="ticket-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Artículos</th>
                        <th style="text-align: right; width: 80px;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
            
            <hr class="ticket-divider">
            
            <div class="ticket-totals">
                <div>Subtotal: ${currency}${subtotal.toFixed(2)}</div>
                ${discount > 0 ? `<div>Descuento: -${currency}${discount.toFixed(2)}</div>` : ''}
                <div>IVA (${settings.storeTax}%): ${currency}${tax.toFixed(2)}</div>
                <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">
                    TOTAL: ${currency}${total.toFixed(2)}
                </div>
            </div>
            
            <hr class="ticket-divider" style="margin-top: 12px;">
            
            <div class="ticket-info" style="margin-top: 6px;">
                <div><strong>Método de Pago:</strong> ${getPaymentMethodLabel(sale.paymentMethod)}</div>
                ${sale.paymentMethod === 'cash' ? `
                    <div><strong>Efectivo Recibido:</strong> ${currency}${sale.amountReceived.toFixed(2)}</div>
                    <div><strong>Cambio Entregado:</strong> ${currency}${sale.changeReturned.toFixed(2)}</div>
                ` : ''}
            </div>
            
            <div class="ticket-footer">
                <p style="font-weight: bold; margin-bottom: 6px;">¡Gracias por su compra!</p>
                <p>Conserve este ticket para cambios o garantías de repuestos eléctricos.</p>
                <div style="margin-top: 12px; font-size: 10px; color: #555;">Desarrollado por Macutech v1.0.0</div>
            </div>
        </div>
    `;
}

function getPaymentMethodLabel(method) {
    switch (method) {
        case 'cash': return 'Efectivo';
        case 'card': return 'Tarjeta Crédito/Débito';
        case 'transfer': return 'Transferencia Bancaria';
        default: return 'Otro';
    }
}

/**
 * Creates HTML for a product card inside the public catalog grid.
 * @param {Object} product - The product object
 * @param {string} currency - Store currency symbol
 * @returns {string} HTML string
 */
function createCatalogProductCard(product, currency = '$') {
    const isOutOfStock = product.stock <= 0;
    const cardClass = isOutOfStock ? 'prod-card out-of-stock' : 'prod-card';
    
    let stockClass = 'stock-badge-ok';
    let stockText = `${product.stock} disp.`;
    
    if (product.stock <= 0) {
        stockClass = 'stock-badge-out';
        stockText = 'Agotado';
    } else if (product.stock <= product.stockMin) {
        stockClass = 'stock-badge-low';
        stockText = 'Stock Bajo';
    }

    const imagePlaceholder = product.image ? 
        `<img src="${product.image}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);" onerror="this.innerHTML='<i data-lucide=\\'image\\'></i>'; this.style.display='none'; this.nextElementSibling.style.display='block';">` : '';
    
    const iconStyle = product.image ? 'display: none;' : '';

    return `
        <div class="${cardClass}" data-id="${product.id}">
            <span class="prod-card-sku">${product.sku}</span>
            <div class="prod-card-image">
                ${imagePlaceholder}
                <div class="fallback-icon" style="${iconStyle}">
                    <i data-lucide="${product.category === 'Herramientas' ? 'wrench' : 'package'}"></i>
                </div>
            </div>
            <div class="prod-card-info">
                <span class="prod-card-cat">${product.category}</span>
                <h4 class="prod-card-title" title="${product.name}">${product.name}</h4>
                <div class="prod-card-footer">
                    <span class="prod-card-price">${currency}${product.price.toFixed(2)}</span>
                    <span class="prod-card-stock ${stockClass}">${stockText}</span>
                </div>
            </div>
        </div>
    `;
}
