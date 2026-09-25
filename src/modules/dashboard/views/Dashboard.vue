<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import { useDashboardAnalytics } from '../composables/useDashboardAnalytics'
import { useCurrency } from '../../../shared/composables/useCurrency'

const {
  totalRevenue, netProfit, totalOrders,
  revenueVsExpensesData, dailySalesTrendData, salesByProductData,
  orderStatusData,
  newCustomersThisMonth,
} = useDashboardAnalytics()

// ── Canvas refs ────────────────────────────────────────
const revExpCanvas   = ref(null)
const trendCanvas    = ref(null)
const productCanvas  = ref(null)
const statusCanvas   = ref(null)

let revExpChart = null, trendChart = null, productChart = null,
    statusChart = null, observer = null

const { symbol: currencySymbol, fmt: fmtCurrency } = useCurrency()

const fmt = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K'
  return n.toFixed(2)
}

const getColors = () => {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    text  : isDark ? '#d1d5db' : '#6b7280',
    grid  : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
    bg    : isDark ? '#1f2937' : '#ffffff',
    label : isDark ? '#9ca3af' : '#9ca3af',
  }
}

// ── Chart initialisers ─────────────────────────────────
const initCharts = () => {
  const c = getColors()

  const baseScales = {
    y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text } },
    x: { grid: { display: false }, ticks: { color: c.text } }
  }
  const baseLegend = { labels: { color: c.text, usePointStyle: true, pointStyleWidth: 8 } }

  ;[revExpChart, trendChart, productChart, statusChart].forEach(ch => ch?.destroy())

  // 1. Revenue vs Expenses — grouped bar
  if (revExpCanvas.value) {
    const d = revenueVsExpensesData.value
    revExpChart = new Chart(revExpCanvas.value, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [
          {
            label: `Revenue (${currencySymbol.value})`,
            data: d.revenue,
            backgroundColor: 'rgba(5,150,105,0.85)',
            borderRadius: 5,
          },
          {
            label: `Expenses (${currencySymbol.value})`,
            data: d.expenses,
            backgroundColor: 'rgba(239,68,68,0.75)',
            borderRadius: 5,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: baseLegend, tooltip: { mode: 'index' } },
        scales: baseScales
      }
    })
  }

  // 2. Daily Sales Trend — area line
  if (trendCanvas.value) {
    const d = dailySalesTrendData.value
    trendChart = new Chart(trendCanvas.value, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [{
          label: 'Sales (Rp)',
          data: d.data,
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13,148,136,0.12)',
          fill: true,
          tension: 0.45,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0d9488',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: baseScales
      }
    })
  }

  // 3. Top Products — donut
  if (productCanvas.value) {
    const d = salesByProductData.value
    productChart = new Chart(productCanvas.value, {
      type: 'doughnut',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          backgroundColor: ['#059669','#0d9488','#0891b2','#7c3aed','#f59e0b'],
          borderWidth: 2,
          borderColor: c.bg,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: c.text, usePointStyle: true, pointStyleWidth: 8, padding: 12, font: { size: 11 } } }
        }
      }
    })
  }

  // 4. Order Status — donut
  if (statusCanvas.value) {
    const d = orderStatusData.value
    statusChart = new Chart(statusCanvas.value, {
      type: 'doughnut',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          backgroundColor: ['#059669','#f59e0b','#6366f1','#ef4444'],
          borderWidth: 2,
          borderColor: c.bg,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: c.text, usePointStyle: true, pointStyleWidth: 8, padding: 12, font: { size: 11 } } }
        }
      }
    })
  }
}

const updateAll = () => {
  const d1 = revenueVsExpensesData.value
  if (revExpChart) {
    revExpChart.data.labels = d1.labels
    revExpChart.data.datasets[0].data = d1.revenue
    revExpChart.data.datasets[1].data = d1.expenses
    revExpChart.update()
  }
  const d2 = dailySalesTrendData.value
  if (trendChart) {
    trendChart.data.labels = d2.labels
    trendChart.data.datasets[0].data = d2.data
    trendChart.update()
  }
  const d3 = salesByProductData.value
  if (productChart) {
    productChart.data.labels = d3.labels
    productChart.data.datasets[0].data = d3.data
    productChart.update()
  }
  const d4 = orderStatusData.value
  if (statusChart) {
    statusChart.data.datasets[0].data = d4.data
    statusChart.update()
  }
}

onMounted(() => {
  initCharts()
  watch(
    [revenueVsExpensesData, dailySalesTrendData, salesByProductData, orderStatusData],
    updateAll, { deep: true }
  )
  observer = new MutationObserver(initCharts)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onUnmounted(() => {
  observer?.disconnect()
  ;[revExpChart, trendChart, productChart, statusChart].forEach(c => c?.destroy())
})
</script>

<template>
  <section class="pb-12 space-y-10">

    <!-- Header -->
    <header>
      <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Dashboard</h2>
      <p class="mt-1 text-gray-500 dark:text-gray-400">Business performance at a glance.</p>
    </header>

    <!-- ── KPI Cards ──────────────────────────────────────────────── -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

      <!-- Total Revenue -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 flex flex-col gap-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Revenue</span>
        <div>
          <p class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{{ currencySymbol }} {{ fmt(totalRevenue) }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">From all paid orders</p>
        </div>
      </div>

      <!-- Net Profit -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 flex flex-col gap-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Net Profit</span>
        <div>
          <p class="text-3xl font-bold tracking-tight"
            :class="netProfit >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500 dark:text-red-400'">
            {{ netProfit >= 0 ? '' : '-' }}{{ currencySymbol }} {{ fmt(Math.abs(netProfit)) }}
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Income minus expenses</p>
        </div>
      </div>

      <!-- Total Orders -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 flex flex-col gap-3">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Orders</span>
        <div>
          <p class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{{ totalOrders }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">All time orders</p>
        </div>
      </div>
    </div>

    <!-- ── Charts Row 1: Revenue vs Expenses + Daily Trend ────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">

      <!-- Revenue vs Expenses bar -->
      <div class="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div class="mb-4">
          <h3 class="text-base font-bold text-gray-800 dark:text-white">Revenue vs Expenses</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 6 months comparison</p>
        </div>
        <div class="relative h-64">
          <canvas ref="revExpCanvas"></canvas>
        </div>
      </div>

      <!-- Daily Sales Trend line -->
      <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div class="mb-4">
          <h3 class="text-base font-bold text-gray-800 dark:text-white">Daily Sales Trend</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 14 days</p>
        </div>
        <div class="relative h-64">
          <canvas ref="trendCanvas"></canvas>
        </div>
      </div>
    </div>

    <!-- ── Charts Row 2: Products + Order Status ─────────── -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">

      <!-- Top Products donut -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div class="mb-4">
          <h3 class="text-base font-bold text-gray-800 dark:text-white">Top Products</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">By revenue contribution</p>
        </div>
        <div class="relative h-60">
          <canvas ref="productCanvas"></canvas>
        </div>
      </div>

      <!-- Order Status donut -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div class="mb-4">
          <h3 class="text-base font-bold text-gray-800 dark:text-white">Order Status</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Distribution of all orders</p>
        </div>
        <div class="relative h-60">
          <canvas ref="statusCanvas"></canvas>
        </div>
      </div>
    </div>

  </section>
</template>
