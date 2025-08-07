// Configuration
const API_BASE_URL = 'http://localhost:3000'; // Update this to match your backend port

// Global variables
let portfolioData = [];
let targetPortfolioValue = 0;
let performanceChart = null;

// API Helper Functions
async function apiRequest(endpoint, options = {}) {
  try {
    console.log(`Making API request to: ${API_BASE_URL}${endpoint}`);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Show loading state
function showLoadingMessage(message = 'Loading...') {
  const tableBody = document.getElementById('assetTableBody');
  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 20px; color: #888;">
        ${message}
      </td>
    </tr>
  `;
}

// Load Holdings Data
async function loadHoldings() {
  try {
    showLoadingMessage('Loading portfolio data...');
    const holdings = await apiRequest('/holdings');
    portfolioData = holdings;
    updateHoldingsTable();
    updateProgressTracker();
    updateTopPerformers();
    updateAlerts();
  } catch (error) {
    console.error('Failed to load holdings:', error);
    showLoadingMessage('Failed to load portfolio data. Please check your connection and try again.');
  }
}

// Load Portfolio Performance History
async function loadPortfolioHistory() {
  try {
    const history = await apiRequest('/portfolio/performance');
    updatePerformanceChart(history);
  } catch (error) {
    console.error('Failed to load portfolio history:', error);
    // Show empty chart if history fails
    updatePerformanceChart([]);
  }
}

// Update Holdings Table
function updateHoldingsTable() {
  const tableBody = document.getElementById('assetTableBody');
  
  if (!portfolioData || portfolioData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px; color: #888;">
          No holdings found. Add your first asset above.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = '';

  portfolioData.forEach(holding => {
    const row = tableBody.insertRow();
    const returnColor = holding.return_value >= 0 ? 'var(--success)' : 'var(--danger)';
    const returnSign = holding.return_value >= 0 ? '+' : '';
    
    // Format the last_updated date
    const lastUpdated = holding.last_updated 
      ? new Date(holding.last_updated).toLocaleString()
      : 'N/A';

    row.innerHTML = `
      <td>
        <input type="checkbox" class="asset-checkbox" 
               data-symbol="${holding.symbol}" 
               onchange="updateAssetDetails()">
      </td>
      <td>${holding.symbol}</td>
      <td>${holding.company_name}</td>
      <td>${holding.quantity}</td>
      <td>$${parseFloat(holding.buy_price).toFixed(2)}</td>
      <td>$${holding.current_price ? parseFloat(holding.current_price).toFixed(2) : 'N/A'}</td>
      <td>$${holding.threshold ? parseFloat(holding.threshold).toFixed(2) : 'N/A'}</td>
      <td style="color: ${returnColor};">
        ${returnSign}$${holding.return_value ? Math.abs(parseFloat(holding.return_value)).toFixed(2) : '0.00'}
      </td>
      <td>${lastUpdated}</td>
      <td>
        <button class="btn btn-danger" onclick="removeAsset('${holding.symbol}')">
          Remove
        </button>
      </td>
    `;
  });
}

// Add Asset Function
async function addAsset(event) {
  event.preventDefault();

  const symbol = document.getElementById('symbol').value.toUpperCase().trim();
  const companyName = document.getElementById('companyName').value.trim();
  const quantity = parseInt(document.getElementById('quantity').value);
  const buyPrice = parseFloat(document.getElementById('buyPrice').value);
  const threshold = parseFloat(document.getElementById('threshold').value);

  if (!symbol || !companyName || !quantity || !buyPrice) {
    alert('Please fill in all required fields');
    return;
  }

  // Disable submit button to prevent double submission
  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    const response = await apiRequest('/api/add-stock', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        company_name: companyName,
        quantity,
        buy_price: buyPrice,
        threshold: threshold || null
      })
    });

    alert(response.message || 'Stock added successfully!');
    
    // Clear form
    document.getElementById('assetForm').reset();
    
    // Reload holdings data
    await loadHoldings();
    
  } catch (error) {
    console.error('Failed to add asset:', error);
    alert('Failed to add stock. Please try again.');
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Asset';
  }
}

// Remove Asset Function
async function removeAsset(symbol) {
  if (!confirm(`Are you sure you want to remove ${symbol}?`)) {
    return;
  }

  try {
    const response = await apiRequest(`/api/remove-stock/${symbol}`, {
      method: 'DELETE'
    });

    alert(response.message || 'Stock removed successfully!');
    
    // Reload holdings data
    await loadHoldings();
    
    // Clear asset details if the removed asset was selected
    updateAssetDetails();
    
  } catch (error) {
    console.error('Failed to remove asset:', error);
    alert('Failed to remove stock. Please try again.');
  }
}

// Remove Selected Assets
async function removeSelectedAssets() {
  const checkboxes = document.querySelectorAll('.asset-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('Please select assets to remove');
    return;
  }

  if (!confirm(`Are you sure you want to remove ${checkboxes.length} selected asset(s)?`)) {
    return;
  }

  const symbols = Array.from(checkboxes).map(cb => cb.dataset.symbol);
  
  try {
    // Remove each selected asset
    for (const symbol of symbols) {
      await apiRequest(`/api/remove-stock/${symbol}`, {
        method: 'DELETE'
      });
    }
    
    alert('Selected stocks removed successfully!');
    await loadHoldings();
    updateAssetDetails();
    
  } catch (error) {
    console.error('Failed to remove selected assets:', error);
    alert('Failed to remove some stocks. Please try again.');
  }
}

// Update Asset Details based on selected checkboxes
async function updateAssetDetails() {
  const selectedCheckboxes = document.querySelectorAll('.asset-checkbox:checked');
  const assetDetailsContainer = document.getElementById('assetDetailsContainer');

  if (selectedCheckboxes.length === 0) {
    assetDetailsContainer.innerHTML = 
      '<p class="no-selection">Select assets from the holdings table to view details</p>';
    return;
  }

  // Show loading state
  assetDetailsContainer.innerHTML = '<p class="no-selection">Loading asset details...</p>';

  let detailsHTML = '';

  for (let i = 0; i < selectedCheckboxes.length; i++) {
    const checkbox = selectedCheckboxes[i];
    const symbol = checkbox.dataset.symbol;
    
    try {
      // Fetch latest stock data from API
      const stockData = await apiRequest(`/api/latest-stock/${symbol}`);
      
      const changeClass = stockData.change_value >= 0 ? 'positive-value' : 'negative-value';
      const changeSign = stockData.change_value >= 0 ? '+' : '';
      const percentSign = stockData.percent_change >= 0 ? '+' : '';

      detailsHTML += `
        <div class="asset-detail-card" ${
          i > 0 ? 'style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);"' : ''
        }>
          <h4 style="color: var(--accent-blue); margin-bottom: 1rem;">${symbol}</h4>
          <div class="asset-details-table">
            <div class="details-row">
              <span class="details-label">Open Price:</span>
              <span class="details-value">$${parseFloat(stockData.open_price || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">High:</span>
              <span class="details-value">$${parseFloat(stockData.high_price || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Low:</span>
              <span class="details-value">$${parseFloat(stockData.low_price || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Current Price:</span>
              <span class="details-value">$${parseFloat(stockData.current_price || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Previous Close:</span>
              <span class="details-value">$${parseFloat(stockData.previous_close || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Change:</span>
              <span class="details-value ${changeClass}">${changeSign}$${Math.abs(stockData.change_value || 0).toFixed(2)}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Change %:</span>
              <span class="details-value ${changeClass}">${percentSign}${parseFloat(stockData.percent_change || 0).toFixed(2)}%</span>
            </div>
            <div class="details-row">
              <span class="details-label">Last Update:</span>
              <span class="details-value">${new Date(stockData.fetched_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error(`Failed to fetch data for ${symbol}:`, error);
      detailsHTML += `
        <div class="asset-detail-card" ${
          i > 0 ? 'style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);"' : ''
        }>
          <h4 style="color: var(--accent-blue); margin-bottom: 1rem;">${symbol}</h4>
          <p style="color: rgba(255,255,255,0.6); text-align: center; padding: 1rem;">
            No detailed data available for ${symbol}
          </p>
        </div>
      `;
    }
  }

  assetDetailsContainer.innerHTML = detailsHTML;
}

// Update Top Performers
function updateTopPerformers() {
  const topPerformersContainer = document.getElementById('topPerformersContainer');
  
  if (!portfolioData || portfolioData.length === 0) {
    topPerformersContainer.innerHTML = `
      <div class="performance-item">
        <span>No holdings available</span>
        <span class="performance-gain">--</span>
      </div>
    `;
    return;
  }

  // Sort by return value and take top 3
  const sortedHoldings = [...portfolioData]
    .filter(holding => holding.return_value !== null)
    .sort((a, b) => parseFloat(b.return_value) - parseFloat(a.return_value))
    .slice(0, 3);

  if (sortedHoldings.length === 0) {
    topPerformersContainer.innerHTML = `
      <div class="performance-item">
        <span>No performance data</span>
        <span class="performance-gain">--</span>
      </div>
    `;
    return;
  }

  let html = '';
  sortedHoldings.forEach(holding => {
    const returnValue = parseFloat(holding.return_value);
    const returnPercent = holding.buy_price ? ((returnValue / (holding.buy_price * holding.quantity)) * 100).toFixed(2) : 0;
    const gainClass = returnValue >= 0 ? 'performance-gain' : 'performance-loss';
    const sign = returnValue >= 0 ? '+' : '';
    
    html += `
      <div class="performance-item">
        <span>${holding.symbol}</span>
        <span class="${gainClass}">${sign}${returnPercent}%</span>
      </div>
    `;
  });

  topPerformersContainer.innerHTML = html;
}

// Update Alerts
function updateAlerts() {
  const alertContainer = document.getElementById('alertContainer');
  
  if (!portfolioData || portfolioData.length === 0) {
    alertContainer.innerHTML = `
      <div class="alert-item">
        <span>No alerts</span>
        <span class="alert-icon">✅</span>
      </div>
    `;
    return;
  }

  let alerts = [];
  const currentPortfolioValue = calculateCurrentPortfolioValue();

  // Check for threshold alerts
  portfolioData.forEach(holding => {
    if (holding.threshold && holding.current_price) {
      if (holding.current_price <= holding.threshold) {
        alerts.push({
          message: `${holding.symbol} below threshold ($${holding.current_price})`,
          icon: '⚠️'
        });
      }
    }
  });

  // Check if portfolio is below target
  if (targetPortfolioValue > 0 && currentPortfolioValue < targetPortfolioValue) {
    const shortfall = ((targetPortfolioValue - currentPortfolioValue) / targetPortfolioValue * 100).toFixed(1);
    alerts.push({
      message: `Portfolio ${shortfall}% below target`,
      icon: '📉'
    });
  }

  if (alerts.length === 0) {
    alertContainer.innerHTML = `
      <div class="alert-item">
        <span>No active alerts</span>
        <span class="alert-icon">✅</span>
      </div>
    `;
  } else {
    let html = '';
    alerts.slice(0, 3).forEach(alert => {
      html += `
        <div class="alert-item">
          <span>${alert.message}</span>
          <span class="alert-icon">${alert.icon}</span>
        </div>
      `;
    });
    alertContainer.innerHTML = html;
  }
}

// Calculate current portfolio value
function calculateCurrentPortfolioValue() {
  return portfolioData.reduce((total, holding) => {
    const currentPrice = holding.current_price || 0;
    const quantity = holding.quantity || 0;
    return total + (currentPrice * quantity);
  }, 0);
}

// Update Performance Chart
function updatePerformanceChart(historyData) {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (performanceChart) {
    performanceChart.destroy();
  }

  if (!historyData || historyData.length === 0) {
    // Show empty chart message
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No performance data available', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  const labels = historyData.map(item => 
    new Date(item.timestamp).toLocaleDateString()
  );
  const values = historyData.map(item => parseFloat(item.total_value));

  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Portfolio Value',
        data: values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { 
            color: '#ffffff',
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#ffffff' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#ffffff' }
        }
      }
    }
  });
}

// Set target portfolio value
function setTarget() {
  const targetInput = document.getElementById('targetInput');
  const targetValue = parseFloat(targetInput.value);

  if (!targetValue || targetValue <= 0) {
    alert('Please enter a valid target value');
    return;
  }

  targetPortfolioValue = targetValue;
  updateProgressTracker();
  updateAlerts(); // Update alerts after setting target

  // Clear the input
  targetInput.value = '';
}

// Update progress tracker
function updateProgressTracker() {
  const currentValue = calculateCurrentPortfolioValue();
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const targetDetails = document.getElementById('targetDetails');
  const currentValueEl = document.getElementById('currentValue');
  const targetValueEl = document.getElementById('targetValue');
  const remainingValueEl = document.getElementById('remainingValue');

  if (targetPortfolioValue > 0) {
    const progress = Math.min((currentValue / targetPortfolioValue) * 100, 100);
    const remaining = targetPortfolioValue - currentValue;

    progressFill.style.width = progress + '%';
    progressText.textContent = `Progress: ${progress.toFixed(1)}%`;

    // Show target details
    targetDetails.style.display = 'block';
    currentValueEl.textContent = `$${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    targetValueEl.textContent = `$${targetPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    if (remaining > 0) {
      remainingValueEl.textContent = `$${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      remainingValueEl.style.color = 'var(--warning)';
    } else {
      remainingValueEl.textContent = `Target Achieved! +$${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      remainingValueEl.style.color = 'var(--success)';
    }
  } else {
    progressFill.style.width = '0%';
    progressText.textContent = 'Set a target to track progress';
    targetDetails.style.display = 'none';
  }
}

// Search functionality
function filterAssets() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const rows = document.querySelectorAll('#assetTableBody tr');

  rows.forEach(row => {
    if (row.cells.length === 1) return; // Skip loading/empty rows
    
    const symbol = row.cells[1].textContent.toLowerCase();
    const companyName = row.cells[2].textContent.toLowerCase();
    if (symbol.includes(searchTerm) || companyName.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Export functions
function exportToCSV() {
  if (!portfolioData || portfolioData.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = [
    'Symbol', 'Company Name', 'Quantity', 'Buy Price', 
    'Current Price', 'Threshold', 'Return Value', 'Last Updated'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  portfolioData.forEach(holding => {
    const row = [
      holding.symbol,
      `"${holding.company_name}"`, // Wrap in quotes to handle commas
      holding.quantity,
      holding.buy_price,
      holding.current_price || 'N/A',
      holding.threshold || 'N/A',
      holding.return_value || 0,
      holding.last_updated || 'N/A'
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_data_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Refresh data from server
async function refreshData() {
  try {
    // Show loading states
    showLoadingMessage('Refreshing data...');
    
    // Trigger backend updates
    await apiRequest('/updateHoldings', { method: 'POST' });
    await apiRequest('/updatePortfolioHistory', { method: 'POST' });
    
    // Reload frontend data
    await loadHoldings();
    await loadPortfolioHistory();
    
    alert('Data refreshed successfully!');
  } catch (error) {
    console.error('Failed to refresh data:', error);
    alert('Failed to refresh data. Please try again.');
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  // Initial data load
  loadHoldings();
  loadPortfolioHistory();

  // Form submission
  document.getElementById('assetForm').addEventListener('submit', addAsset);

  // Search functionality
  document.getElementById('searchInput').addEventListener('input', filterAssets);

  // Select all checkbox
  document.getElementById('selectAll').addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.asset-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = this.checked;
    });
    updateAssetDetails();
  });

  // Auto-refresh every 2 minutes for holdings data
  setInterval(async () => {
    try {
      console.log('Auto-refreshing holdings data...');
      await loadHoldings();
    } catch (error) {
      console.error('Auto-refresh failed:', error);
    }
  }, 120000); // 2 minutes

  // Auto-refresh portfolio history every 5 minutes
  setInterval(async () => {
    try {
      console.log('Auto-refreshing portfolio history...');
      await loadPortfolioHistory();
    } catch (error) {
      console.error('Portfolio history auto-refresh failed:', error);
    }
  }, 300000); // 5 minutes

  // Handle form input validation
  const form = document.getElementById('assetForm');
  const inputs = form.querySelectorAll('input[required]');
  
  inputs.forEach(input => {
    input.addEventListener('blur', function() {
      if (this.value.trim() === '') {
        this.style.borderColor = '#dc3545';
      } else {
        this.style.borderColor = '';
      }
    });

    input.addEventListener('input', function() {
      if (this.style.borderColor === 'rgb(220, 53, 69)') {
        this.style.borderColor = '';
      }
    });
  });

  // Symbol input transformation to uppercase
  document.getElementById('symbol').addEventListener('input', function() {
    this.value = this.value.toUpperCase();
  });

  // Numeric input validation
  const numericInputs = ['quantity', 'buyPrice', 'threshold'];
  numericInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', function() {
        // Remove any non-numeric characters except decimal point
        if (id === 'quantity') {
          this.value = this.value.replace(/[^\d]/g, '');
        } else {
          this.value = this.value.replace(/[^\d.]/g, '');
          
          // Ensure only one decimal point
          const parts = this.value.split('.');
          if (parts.length > 2) {
            this.value = parts[0] + '.' + parts.slice(1).join('');
          }
        }
      });
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(event) {
    // Ctrl/Cmd + R for refresh
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
      event.preventDefault();
      refreshData();
    }
    
    // Escape key to clear asset selection
    if (event.key === 'Escape') {
      const checkboxes = document.querySelectorAll('.asset-checkbox:checked');
      checkboxes.forEach(cb => cb.checked = false);
      document.getElementById('selectAll').checked = false;
      updateAssetDetails();
    }
  });

  // Handle network errors gracefully
  window.addEventListener('online', function() {
    console.log('Network connection restored');
    loadHoldings();
    loadPortfolioHistory();
  });

  window.addEventListener('offline', function() {
    console.log('Network connection lost');
    alert('Network connection lost. Some features may not work properly.');
  });
});

// Additional utility functions

// Format currency for display
function formatCurrency(amount, showCents = true) {
  if (amount === null || amount === undefined) return 'N/A';
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  });
  
  return formatter.format(amount);
}

// Format percentage for display
function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined) return 'N/A';
  return `${value >= 0 ? '+' : ''}${parseFloat(value).toFixed(decimals)}%`;
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Enhanced search with debouncing
const debouncedFilter = debounce(filterAssets, 300);

// Update the search input event listener to use debounced version
document.addEventListener('DOMContentLoaded', function() {
  // Replace the existing search listener
  document.getElementById('searchInput').addEventListener('input', debouncedFilter);
});

// Error handling helper
function handleApiError(error, userMessage = 'An error occurred') {
  console.error('API Error:', error);
  
  if (error.message.includes('Failed to fetch')) {
    alert('Unable to connect to server. Please check your internet connection and try again.');
  } else if (error.message.includes('500')) {
    alert('Server error. Please try again later.');
  } else if (error.message.includes('404')) {
    alert('Requested data not found.');
  } else {
    alert(userMessage);
  }
}

// Add CSS classes dynamically for styling
function addDynamicStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .positive-value {
      color: #10b981 !important;
    }
    
    .negative-value {
      color: #ef4444 !important;
    }
    
    .performance-gain {
      color: #10b981;
      font-weight: bold;
    }
    
    .performance-loss {
      color: #ef4444;
      font-weight: bold;
    }
    
    .loading {
      opacity: 0.6;
      pointer-events: none;
    }
    
    .details-row {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .details-label {
      color: rgba(255,255,255,0.7);
    }
    
    .details-value {
      color: #ffffff;
      font-weight: bold;
    }
    
    .asset-details-table {
      margin-top: 0.5rem;
    }
    
    .no-selection {
      color: rgba(255,255,255,0.6);
      text-align: center;
      padding: 1rem;
    }
    
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
    
    .loading-pulse {
      animation: pulse 1.5s infinite;
    }
  `;
  document.head.appendChild(style);
}

// Initialize dynamic styles when DOM is loaded
document.addEventListener('DOMContentLoaded', addDynamicStyles);

// Local storage for target value persistence
function saveTargetValue(value) {
  try {
    localStorage.setItem('portfolioTarget', value.toString());
  } catch (error) {
    console.warn('Could not save target value to local storage');
  }
}

function loadTargetValue() {
  try {
    const saved = localStorage.getItem('portfolioTarget');
    if (saved) {
      targetPortfolioValue = parseFloat(saved);
      updateProgressTracker();
    }
  } catch (error) {
    console.warn('Could not load target value from local storage');
  }
}

// Enhanced setTarget function
function setTarget() {
  const targetInput = document.getElementById('targetInput');
  const targetValue = parseFloat(targetInput.value);

  if (!targetValue || targetValue <= 0) {
    alert('Please enter a valid target value');
    return;
  }

  targetPortfolioValue = targetValue;
  saveTargetValue(targetValue); // Persist target value
  updateProgressTracker();
  updateAlerts();

  // Clear the input
  targetInput.value = '';
  
  // Show confirmation
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 1000;
    font-weight: bold;
  `;
  notification.textContent = `Target set to ${formatCurrency(targetValue)}`;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Load saved target on page load
document.addEventListener('DOMContentLoaded', function() {
  loadTargetValue();
});