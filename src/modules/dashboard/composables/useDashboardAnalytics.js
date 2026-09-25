import { computed } from 'vue'
import { useSalesStore } from '../../sales/stores/sales'
import { useCustomersStore } from '../../customer/stores/customers'
import { useFinanceStore } from '../../finance/stores/finance'

export function useDashboardAnalytics() {
    const salesStore = useSalesStore()
    const customersStore = useCustomersStore()
    const financeStore = useFinanceStore()

    const toDate = (ts) => {
        if (!ts) return null
        return ts.toDate ? ts.toDate() : new Date(ts)
    }

    // ─── KPI 1: Total Revenue (all paid orders) ───────────────────────
    const totalRevenue = computed(() =>
        salesStore.orders
            .filter(o => o.paymentStatus === 'Paid')
            .reduce((acc, o) => acc + (o.total || 0), 0)
    )

    // ─── KPI 2: Net Profit (Income − Expenses) ────────────────────────
    const netProfit = computed(() =>
        financeStore.totalIncome - financeStore.totalExpenses
    )

    // ─── KPI 3: Total Orders ──────────────────────────────────────────
    const totalOrders = computed(() => salesStore.orders.length)

    // (keep for backwards compat)
    const openOrders = computed(() =>
        salesStore.orders.filter(o => o.status === 'Processing').length
    )
    const newCustomersThisMonth = computed(() => {
        const start = new Date()
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        return customersStore.items.filter(c => {
            const d = toDate(c.createdAt)
            return d && d >= start
        }).length
    })

    // ─── CHART 1: Monthly Revenue vs Expenses (last 6 months) ─────────
    const revenueVsExpensesData = computed(() => {
        const now = new Date()
        const months = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
            return { label: d.toLocaleString('default', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() }
        })

        const revenue = months.map(m =>
            salesStore.orders
                .filter(o => {
                    const d = toDate(o.createdAt)
                    return d && d.getFullYear() === m.year && d.getMonth() === m.month && o.paymentStatus === 'Paid'
                })
                .reduce((acc, o) => acc + (o.total || 0), 0)
        )

        const expenses = months.map(m =>
            financeStore.allExpenses
                .filter(e => {
                    const d = toDate(e.date)
                    return d && d.getFullYear() === m.year && d.getMonth() === m.month
                })
                .reduce((acc, e) => acc + (e.amount || 0), 0)
        )

        return { labels: months.map(m => m.label), revenue, expenses }
    })

    // ─── CHART 2: Daily Sales Trend (last 14 days) ────────────────────
    const dailySalesTrendData = computed(() => {
        const days = Array.from({ length: 14 }, (_, i) => {
            const d = new Date()
            d.setDate(d.getDate() - (13 - i))
            d.setHours(0, 0, 0, 0)
            return d
        })

        const totals = days.map(day => {
            const next = new Date(day)
            next.setDate(next.getDate() + 1)
            return salesStore.orders
                .filter(o => {
                    const d = toDate(o.createdAt)
                    return d && d >= day && d < next && o.paymentStatus === 'Paid'
                })
                .reduce((acc, o) => acc + (o.total || 0), 0)
        })

        const labels = days.map(d => d.toLocaleString('default', { month: 'short', day: 'numeric' }))
        return { labels, data: totals }
    })

    // ─── CHART 3: Top 5 Products by Revenue ───────────────────────────
    const salesByProductData = computed(() => {
        const map = {}
        salesStore.orders
            .filter(o => o.paymentStatus === 'Paid')
            .forEach(o => {
                ;(o.items || []).forEach(item => {
                    const key = item.name || 'Unknown'
                    map[key] = (map[key] || 0) + (item.subtotal != null ? item.subtotal : (item.price * item.qty || 0))
                })
            })
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
        return {
            labels: sorted.length ? sorted.map(([n]) => n) : ['No sales yet'],
            data: sorted.length ? sorted.map(([, v]) => v) : [1]
        }
    })

    // ─── CHART 4: Order Status Distribution ───────────────────────────
    const orderStatusData = computed(() => {
        const statuses = ['Paid', 'Processing', 'Active', 'Cancelled']
        const counts = statuses.map(s =>
            salesStore.orders.filter(o => (o.paymentStatus === s) || (o.status === s)).length
        )
        return { labels: statuses, data: counts }
    })

    // ─── CHART 5: removed (inventory deleted) ─────────────────────────

    // (kept for backwards compat)
    const salesByMonthData = computed(() => ({
        labels: revenueVsExpensesData.value.labels,
        sales: revenueVsExpensesData.value.revenue
    }))
    const weeklyOrdersData = computed(() => {
        const now = new Date()
        const monday = new Date(now)
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
        monday.setHours(0, 0, 0, 0)
        const counts = [0, 0, 0, 0, 0, 0, 0]
        salesStore.orders.forEach(o => {
            const d = toDate(o.createdAt)
            if (!d) return
            const idx = Math.floor((d - monday) / 86400000)
            if (idx >= 0 && idx < 7) counts[idx]++
        })
        return { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], data: counts }
    })

    return {
        // KPIs
        totalRevenue,
        netProfit,
        totalOrders,
        openOrders,
        newCustomersThisMonth,
        // Charts
        revenueVsExpensesData,
        dailySalesTrendData,
        salesByProductData,
        orderStatusData,
        // backwards compat
        salesByMonthData,
        weeklyOrdersData,
    }
}
