import { defineStore } from 'pinia'
import { computed } from 'vue'
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '../../../shared/lib/firebaseClient'
import { useAuthStore } from '../../auth/stores/auth'
import { useSalesStore } from '../../sales/stores/sales'

export const useFinanceStore = defineStore('finance', () => {
    const authStore = useAuthStore()
    const salesStore = useSalesStore()

    // Manual ledger entries (custom income/expenses)
    const ledgerRef = computed(() => {
        const bizId = authStore.user?.businessId
        return bizId ? collection(db, `businesses/${bizId}/ledger`) : null
    })
    const ledgerEntries = useCollection(ledgerRef)

    const toSortTime = (entry) => {
        if (entry.createdAt?.toDate) return entry.createdAt.toDate().getTime()
        if (entry.date) return new Date(entry.date).getTime()
        return 0
    }

    const tsToDateStr = (ts) => {
        if (!ts) return ''
        const d = ts.toDate ? ts.toDate() : new Date(ts)
        return d.toISOString().split('T')[0]
    }

    // --- AUTO-DERIVED INCOME: paid sales orders ---
    const salesIncome = computed(() =>
        salesStore.orders
            .filter(o => o.paymentStatus === 'Paid')
            .map(o => ({
                id: `sale-${o.id}`,
                type: 'income',
                category: 'Product Sales',
                remarks: `${o.orderNumber || ''}${o.customerName ? ' · ' + o.customerName : ''}`,
                amount: o.total || 0,
                date: tsToDateStr(o.createdAt),
                origin: 'sale',
                readonly: true,
                createdAt: o.createdAt
            }))
    )

    // --- MANUAL ENTRIES from ledger ---
    const manualIncome = computed(() =>
        ledgerEntries.value
            .filter(e => e.type === 'income')
            .map(e => ({ ...e, id: e.id, origin: 'manual', readonly: false }))
    )

    const manualExpenses = computed(() =>
        ledgerEntries.value
            .filter(e => e.type === 'expense')
            .map(e => ({ ...e, id: e.id, origin: 'manual', readonly: false }))
    )

    // --- MERGED & SORTED ---
    const allIncome = computed(() =>
        [...salesIncome.value, ...manualIncome.value]
            .sort((a, b) => toSortTime(b) - toSortTime(a))
    )

    const allExpenses = computed(() =>
        [...manualExpenses.value]
            .sort((a, b) => toSortTime(b) - toSortTime(a))
    )

    const totalIncome = computed(() => allIncome.value.reduce((acc, e) => acc + (e.amount || 0), 0))
    const totalExpenses = computed(() => allExpenses.value.reduce((acc, e) => acc + (e.amount || 0), 0))
    const totalBalance = computed(() => totalIncome.value - totalExpenses.value)

    const getBizId = () => {
        const bizId = authStore.user?.businessId
        if (!bizId) throw new Error('No active business session')
        return bizId
    }

    const addLedgerEntry = async ({ type, category, remarks, amount, date, loggedBy = null }) => {
        const bizId = getBizId()
        const docRef = await addDoc(collection(db, `businesses/${bizId}/ledger`), {
            type,
            category,
            remarks: remarks || '',
            amount: Number(amount),
            date,
            loggedByName: loggedBy?.name || null,
            loggedById: loggedBy?.id || null,
            createdAt: serverTimestamp()
        })
        return docRef
    }

    const updateLedgerEntry = async (entryId, updates) => {
        const bizId = getBizId()
        await updateDoc(doc(db, `businesses/${bizId}/ledger`, entryId), updates)
    }

    const deleteLedgerEntry = async (entryId) => {
        const bizId = getBizId()
        await deleteDoc(doc(db, `businesses/${bizId}/ledger`, entryId))
    }

    return {
        allIncome,
        allExpenses,
        totalIncome,
        totalExpenses,
        totalBalance,
        addLedgerEntry,
        updateLedgerEntry,
        deleteLedgerEntry
    }
})
