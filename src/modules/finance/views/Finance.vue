<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useFinanceStore } from '../stores/finance'
import { useAuthStore } from '../../auth/stores/auth'
import { useToastStore } from '../../../shared/stores/toast'
import { storage } from '../../../shared/lib/firebaseClient'
import { useCurrency } from '../../../shared/composables/useCurrency'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const financeStore = useFinanceStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const viewAllType = ref(null) // 'income' | 'expense' | null

const tableIncome = computed(() => financeStore.allIncome.slice(0, 15))

const compressImage = (file, maxWidth = 1200, quality = 0.85) =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => resolve(new File([blob], 'receipt.jpg', { type: 'image/jpeg' })), 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

// --- CATEGORY LISTS ---
const incomeCategories = ['Service Income', 'Investment Returns', 'Rental Income', 'Refunds Received', 'Other Income']
const expenseCategories = ['Bills & Utilities', 'Rent / Mortgage', 'Salaries', 'Marketing', 'Equipment', 'Maintenance', 'Transport', 'Insurance', 'Other Expenses']

// --- EXPENSE GROUPS ---
const EXPENSE_GROUPS = {
  'Cost of Goods': { categories: ['Procurement'], color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', dot: 'bg-orange-500', text: 'text-orange-500 dark:text-orange-400' },
  'Overhead':      { categories: ['Rent / Mortgage', 'Salaries', 'Insurance'], color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', dot: 'bg-red-500', text: 'text-red-500 dark:text-red-400' },
  'Operations':    { categories: ['Bills & Utilities', 'Marketing', 'Maintenance', 'Transport'], color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', text: 'text-amber-500 dark:text-amber-400' },
  'Other':         { categories: [], color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400', dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400' },
}

const getExpenseGroup = (category) => {
  for (const [group, cfg] of Object.entries(EXPENSE_GROUPS)) {
    if (cfg.categories.includes(category)) return group
  }
  return 'Other'
}

const expenseBreakdown = computed(() =>
  Object.entries(EXPENSE_GROUPS).map(([group, cfg]) => {
    const entries = financeStore.allExpenses.filter(e => getExpenseGroup(e.category) === group)
    return { group, total: entries.reduce((acc, e) => acc + (e.amount || 0), 0), count: entries.length, ...cfg }
  }).filter(g => g.count > 0)
)

const expenseGroupFilter = ref('')

const tableExpenses = computed(() => {
  const list = expenseGroupFilter.value
    ? financeStore.allExpenses.filter(e => getExpenseGroup(e.category) === expenseGroupFilter.value)
    : financeStore.allExpenses
  return list.slice(0, 15)
})

// --- VIEW ALL FILTERS ---
const viewAllSearch = ref('')
const viewAllCategoryFilter = ref('')

watch(viewAllType, () => {
  viewAllSearch.value = ''
  viewAllCategoryFilter.value = ''
})

const viewAllIncomeCategories = computed(() =>
  [...new Set(financeStore.allIncome.map(e => e.category).filter(Boolean))].sort()
)
const viewAllExpenseCategories = computed(() =>
  [...new Set(financeStore.allExpenses.map(e => e.category).filter(Boolean))].sort()
)

const filteredViewAllItems = computed(() => {
  const list = viewAllType.value === 'income' ? financeStore.allIncome : financeStore.allExpenses
  const q = viewAllSearch.value.toLowerCase()
  return list.filter(item => {
    const matchCat = !viewAllCategoryFilter.value || item.category === viewAllCategoryFilter.value
    const matchSearch = !q ||
      item.category?.toLowerCase().includes(q) ||
      item.remarks?.toLowerCase().includes(q)
    return matchCat && matchSearch
  })
})

// --- PDF EXPORT ---
const showExportDialog = ref(false)
const exportRange = reactive({
  from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  to: new Date().toISOString().split('T')[0],
})

const exportingPDF = ref(false)

const generatePDF = async () => {
  exportingPDF.value = true
  try {
    const from = new Date(exportRange.from)
    const to = new Date(exportRange.to)
    to.setHours(23, 59, 59)

    const inRange = (dateStr) => {
      if (!dateStr) return true
      const d = new Date(dateStr)
      return d >= from && d <= to
    }

    const income = financeStore.allIncome.filter(e => inRange(e.date))
    const expenses = financeStore.allExpenses.filter(e => inRange(e.date))
    const totalInc = income.reduce((a, e) => a + (e.amount || 0), 0)
    const totalExp = expenses.reduce((a, e) => a + (e.amount || 0), 0)
    const bizName = authStore.user?.businessName || 'Business'

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    let y = 18

    // Header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 77, 64)
    doc.text('Financial Report', pageW / 2, y, { align: 'center' })
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`${bizName}  ·  ${formatDate(exportRange.from)} – ${formatDate(exportRange.to)}`, pageW / 2, y, { align: 'center' })
    y += 10

    // Summary
    autoTable(doc, {
      startY: y,
      head: [['Net Balance', 'Total Income', 'Total Expenses']],
      body: [[formatMoney(totalInc - totalExp), formatMoney(totalInc), formatMoney(totalExp)]],
      headStyles: { fillColor: [0, 77, 64], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 11, fontStyle: 'bold', halign: 'center' },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 8

    // Expense breakdown
    const breakdown = Object.entries(EXPENSE_GROUPS).map(([group]) => {
      const grpExpenses = expenses.filter(e => getExpenseGroup(e.category) === group)
      return { group, total: grpExpenses.reduce((a, e) => a + (e.amount || 0), 0), count: grpExpenses.length }
    }).filter(g => g.count > 0)

    if (breakdown.length) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(50)
      doc.text('Expense Breakdown', 14, y)
      y += 4
      autoTable(doc, {
        startY: y,
        head: [['Group', 'Entries', 'Total']],
        body: breakdown.map(b => [b.group, b.count, formatMoney(b.total)]),
        headStyles: { fillColor: [220, 53, 69], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' } },
        theme: 'striped',
      })
      y = doc.lastAutoTable.finalY + 8
    }

    // Income table
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50)
    doc.text('Income Entries', 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Remarks', 'Amount']],
      body: income.map(e => [formatDate(e.date), e.category, e.remarks || '—', formatMoney(e.amount)]),
      headStyles: { fillColor: [5, 150, 105], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 3: { halign: 'right' } },
      theme: 'striped',
      foot: [['', '', 'Total', formatMoney(totalInc)]],
      footStyles: { fontStyle: 'bold', fillColor: [220, 252, 231] },
    })
    y = doc.lastAutoTable.finalY + 8

    // Expense table
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50)
    doc.text('Expense Entries', 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Group', 'Category', 'Remarks', 'Amount']],
      body: expenses.map(e => [formatDate(e.date), getExpenseGroup(e.category), e.category, e.remarks || '—', formatMoney(e.amount)]),
      headStyles: { fillColor: [220, 53, 69], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 4: { halign: 'right' } },
      theme: 'striped',
      foot: [['', '', '', 'Total', formatMoney(totalExp)]],
      footStyles: { fontStyle: 'bold', fillColor: [254, 226, 226] },
    })

    // Footer
    const pages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(180)
      doc.text(`Generated by MicroOps · Page ${i} of ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    }

    doc.save(`financial-report-${exportRange.from}-to-${exportRange.to}.pdf`)
    showExportDialog.value = false
  } finally {
    exportingPDF.value = false
  }
}

// --- MODAL STATE ---
const activeModal = ref(null)
const isSubmitting = ref(false)
const receiptInput = ref(null)

const form = reactive({
  date: new Date().toISOString().split('T')[0],
  selectedCategory: '',
  customCategory: '',
  remarks: '',
  amount: '',
  receipt: null,
  receiptPreview: null
})

const openModal = (type) => {
  activeModal.value = type
  form.date = new Date().toISOString().split('T')[0]
  form.selectedCategory = ''
  form.customCategory = ''
  form.remarks = ''
  form.amount = ''
  form.receipt = null
  form.receiptPreview = null
}

const closeModal = () => { activeModal.value = null }

const handleReceiptUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  form.receipt = file
  form.receiptPreview = URL.createObjectURL(file)
}

const selectedEntryId = ref(null)
const selectedEntry = computed(() => {
  if (!selectedEntryId.value) return null
  return [...financeStore.allIncome, ...financeStore.allExpenses]
    .find(e => e.id === selectedEntryId.value) ?? null
})

const openDetail = (item) => { selectedEntryId.value = item.id }
const closeDetail = () => { selectedEntryId.value = null }

const saveRecord = async () => {
  const finalCategory = form.selectedCategory === 'NEW' ? form.customCategory.trim() : form.selectedCategory
  if (!finalCategory || !form.amount || isSubmitting.value) return
  isSubmitting.value = true
  const tid = toastStore.loading('Saving record...')
  try {
    const loggedBy = authStore.user
      ? { name: authStore.user.full_name || authStore.user.role, id: authStore.user.profileId }
      : null
    const docRef = await financeStore.addLedgerEntry({
      type: activeModal.value,
      category: finalCategory,
      remarks: form.remarks,
      amount: parseFloat(form.amount),
      date: form.date,
      loggedBy
    })

    if (form.receipt && docRef?.id) {
      const bizId = authStore.user?.businessId
      const compressed = await compressImage(form.receipt)
      const imgRef = storageRef(storage, `business/${bizId}/transactions/${docRef.id}/receipt.jpg`)
      await uploadBytes(imgRef, compressed, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(imgRef)
      await financeStore.updateLedgerEntry(docRef.id, { receiptUrl: url })
    }

    toastStore.replace(tid, 'success', 'Record saved successfully')
    closeModal()
  } catch (err) {
    console.error('Failed to save record:', err)
    toastStore.replace(tid, 'error', 'Failed to save record. Please try again.')
  } finally {
    isSubmitting.value = false
  }
}

const deleteEntry = async (entry) => {
  if (entry.readonly) return
  const tid = toastStore.loading('Deleting entry...')
  try {
    await financeStore.deleteLedgerEntry(entry.id)
    toastStore.replace(tid, 'success', 'Entry deleted')
    closeDetail()
  } catch (err) {
    console.error('Delete entry error:', err)
    toastStore.replace(tid, 'error', 'Failed to delete entry. Please try again.')
  }
}

// --- HELPERS ---
const modalConfig = computed(() => {
  const isIncome = activeModal.value === 'income'
  return {
    title: isIncome ? 'Record Income' : 'Record Expense',
    label: isIncome ? 'Income Source' : 'Expense Category',
    themeColor: isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600',
    categories: isIncome ? incomeCategories : expenseCategories
  }
})

const { fmt: formatMoney } = useCurrency()

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

const originLabel = (origin) => {
  if (origin === 'sale') return 'Sale'
  if (origin === 'stock_in') return 'Stock IN'
  return null
}
</script>

<template>
  <section>
    <header class="mb-8">
      <div>
        <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Financial Overview</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">Track your business cash flow — sales, stock, and manual entries.</p>
      </div>

      <div class="flex justify-end mt-2 mb-1">
        <button @click="showExportDialog = true"
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors shadow-sm">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export PDF Report
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5">
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-colors">
          <span class="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wider">Net Balance</span>
          <span :class="financeStore.totalBalance >= 0 ? 'text-gray-800 dark:text-white' : 'text-red-600 dark:text-red-400'"
            class="text-3xl font-bold mt-2">
            {{ formatMoney(financeStore.totalBalance) }}
          </span>
          <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">Income minus Expenses</span>
        </div>

        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-colors">
          <span class="text-emerald-600 dark:text-emerald-400 text-sm font-medium uppercase tracking-wider">Total Income</span>
          <span class="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">+{{ formatMoney(financeStore.totalIncome) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ financeStore.allIncome.length }} entries</span>
        </div>

        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-colors">
          <span class="text-red-500 dark:text-red-400 text-sm font-medium uppercase tracking-wider">Total Expenses</span>
          <span class="text-3xl font-bold text-red-500 dark:text-red-400 mt-2">-{{ formatMoney(financeStore.totalExpenses) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ financeStore.allExpenses.length }} entries</span>
        </div>
      </div>
    </header>

    <!-- Expense breakdown by group -->
    <div v-if="expenseBreakdown.length > 0" class="mt-6 mb-8">
      <p class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Expense Breakdown</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button v-for="g in expenseBreakdown" :key="g.group"
          @click="expenseGroupFilter = expenseGroupFilter === g.group ? '' : g.group"
          :class="expenseGroupFilter === g.group ? 'bg-gray-50 dark:bg-gray-700/70 shadow-md' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm'"
          class="relative flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-gray-700 transition-all text-left overflow-hidden">
          <div :class="g.dot" class="absolute left-0 inset-y-0 w-1 rounded-l-xl"></div>
          <div class="ml-2">
            <span :class="g.text" class="text-[10px] font-bold uppercase tracking-widest">{{ g.group }}</span>
            <p :class="g.text" class="text-xl font-black mt-1">{{ formatMoney(g.total) }}</p>
            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{{ g.count }} entr{{ g.count === 1 ? 'y' : 'ies' }}</p>
          </div>
          <svg v-if="expenseGroupFilter === g.group" :class="g.text" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

      <!-- INCOME TABLE -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col transition-colors">
        <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h3 class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div> Income
          </h3>
          <div class="flex items-center gap-4">
            <span @click="viewAllType = 'income'" class="text-xs font-bold text-[#4DB6AC] dark:text-teal-400 cursor-pointer hover:underline">View All</span>
            <button @click="openModal('income')"
              class="text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-lg transition-colors">
              + Add New
            </button>
          </div>
        </div>

        <div class="overflow-x-auto flex-1">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
              <tr>
                <th class="p-4 font-medium">Date</th>
                <th class="p-4 font-medium">Category / Details</th>
                <th class="p-4 font-medium text-right">Amount</th>
                <th class="p-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              <tr v-if="tableIncome.length === 0">
                <td colspan="4" class="p-8 text-center text-gray-400 dark:text-gray-500">No income records yet.</td>
              </tr>
              <tr v-for="item in tableIncome" :key="item.id"
                @click="openDetail(item)"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                <td class="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{{ formatDate(item.date) }}</td>
                <td class="p-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{{ item.category }}</span>
                    <span v-if="originLabel(item.origin)"
                      class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 tracking-wide">
                      {{ originLabel(item.origin) }}
                    </span>
                  </div>
                  <div v-if="item.remarks" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[180px]">
                    {{ item.remarks }}
                  </div>
                </td>
                <td class="p-4 text-right text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap">
                  +{{ formatMoney(item.amount) }}
                </td>
                <td class="p-4 text-center">
                  <button v-if="!item.readonly" @click.stop="deleteEntry(item)"
                    class="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded"
                    title="Delete entry">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- EXPENSES TABLE -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col transition-colors">
        <div class="p-6 border-b border-gray-100 dark:border-gray-700">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-red-500"></div>
              Expenses
              <span v-if="expenseGroupFilter" class="text-xs font-bold text-red-600 dark:text-red-400">· {{ expenseGroupFilter }}</span>
            </h3>
            <div class="flex items-center gap-4">
              <span @click="viewAllType = 'expense'" class="text-xs font-bold text-[#4DB6AC] dark:text-teal-400 cursor-pointer hover:underline">View All</span>
              <button @click="openModal('expense')"
                class="text-sm font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors">
                + Add New
              </button>
            </div>
          </div>
          <!-- Group filter chips -->
          <div v-if="expenseBreakdown.length" class="flex flex-wrap gap-1.5">
            <button @click="expenseGroupFilter = ''"
              :class="!expenseGroupFilter ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'"
              class="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors">All</button>
            <button v-for="g in expenseBreakdown" :key="g.group"
              @click="expenseGroupFilter = expenseGroupFilter === g.group ? '' : g.group"
              :class="[expenseGroupFilter === g.group ? g.color + ' ring-1 ring-current' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200']"
              class="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors flex items-center gap-1">
              <span :class="g.dot" class="w-1.5 h-1.5 rounded-full"></span>
              {{ g.group }}
            </button>
          </div>
        </div>

        <div class="overflow-x-auto flex-1">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
              <tr>
                <th class="p-4 font-medium">Date</th>
                <th class="p-4 font-medium">Category / Details</th>
                <th class="p-4 font-medium text-right">Amount</th>
                <th class="p-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              <tr v-if="tableExpenses.length === 0">
                <td colspan="4" class="p-8 text-center text-gray-400 dark:text-gray-500">No expense records yet.</td>
              </tr>
              <tr v-for="item in tableExpenses" :key="item.id"
                @click="openDetail(item)"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                <td class="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{{ formatDate(item.date) }}</td>
                <td class="p-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{{ item.category }}</span>
                    <span :class="EXPENSE_GROUPS[getExpenseGroup(item.category)]?.color"
                      class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded tracking-wide">
                      {{ getExpenseGroup(item.category) }}
                    </span>
                    <span v-if="originLabel(item.origin)"
                      class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 tracking-wide">
                      {{ originLabel(item.origin) }}
                    </span>
                  </div>
                  <div v-if="item.remarks" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[180px]">
                    {{ item.remarks }}
                  </div>
                </td>
                <td class="p-4 text-right text-red-500 dark:text-red-400 font-bold whitespace-nowrap">
                  -{{ formatMoney(item.amount) }}
                </td>
                <td class="p-4 text-center">
                  <button v-if="!item.readonly" @click.stop="deleteEntry(item)"
                    class="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded"
                    title="Delete entry">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- DETAIL MODAL -->
    <Teleport to="body">
      <div v-if="selectedEntry" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="closeDetail" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"></div>
        <div class="relative bg-white dark:bg-gray-800 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden">

          <!-- Header -->
          <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span :class="selectedEntry.type === 'income'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'"
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  {{ selectedEntry.type }}
                </span>
                <span class="font-bold text-gray-800 dark:text-white text-lg">{{ selectedEntry.category }}</span>
              </div>
              <div :class="selectedEntry.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'"
                class="text-3xl font-black font-mono tabular-nums">
                {{ selectedEntry.type === 'income' ? '+' : '−' }}{{ formatMoney(selectedEntry.amount) }}
              </div>
            </div>
            <button @click="closeDetail" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex">
            <!-- Details — left -->
            <div class="flex-1 p-6 space-y-5">
              <div>
                <p class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Date</p>
                <p class="text-gray-800 dark:text-white font-medium">{{ formatDate(selectedEntry.date) }}</p>
              </div>

              <div v-if="selectedEntry.remarks">
                <p class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Remarks</p>
                <p class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{{ selectedEntry.remarks }}</p>
              </div>

              <div>
                <p class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Logged By</p>
                <p v-if="selectedEntry.loggedByName" class="text-gray-800 dark:text-white font-medium">{{ selectedEntry.loggedByName }}</p>
                <p v-else-if="selectedEntry.origin === 'sale'" class="text-gray-500 dark:text-gray-400 text-sm italic">Auto — Sales system</p>
                <p v-else class="text-gray-400 dark:text-gray-500 text-sm italic">Not recorded</p>
              </div>

              <div v-if="originLabel(selectedEntry.origin)">
                <p class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Source</p>
                <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 tracking-wide">
                  {{ originLabel(selectedEntry.origin) }}
                </span>
              </div>
            </div>

            <!-- Receipt — right -->
            <div class="w-56 shrink-0 border-l border-gray-100 dark:border-gray-700 flex flex-col">
              <div v-if="selectedEntry.receiptUrl" class="flex-1 relative overflow-hidden bg-gray-50 dark:bg-gray-900/40">
                <img :src="selectedEntry.receiptUrl" class="absolute inset-0 w-full h-full object-contain p-2" alt="Receipt" />
              </div>
              <div v-else class="flex-1 flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-gray-700/30">
                <svg class="w-10 h-10 text-gray-200 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-xs text-gray-300 dark:text-gray-600 font-medium text-center px-4 leading-relaxed">No receipt attached</span>
              </div>
              <div v-if="selectedEntry.receiptUrl" class="border-t border-gray-100 dark:border-gray-700 p-2 flex justify-center">
                <a :href="selectedEntry.receiptUrl" target="_blank"
                  class="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 font-medium transition-colors">
                  Open full size ↗
                </a>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            <button v-if="!selectedEntry.readonly" @click="deleteEntry(selectedEntry)"
              class="text-red-500 hover:text-red-700 dark:text-red-400 font-bold text-sm flex items-center gap-1.5 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Entry
            </button>
            <div v-else></div>
            <button @click="closeDetail"
              class="py-2 px-6 rounded-lg text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              Close
            </button>
          </div>

        </div>
      </div>
    </Teleport>

    <!-- MODAL -->
    <Teleport to="body">
      <div v-if="activeModal" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="closeModal" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"></div>

        <div class="relative bg-white dark:bg-gray-800 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden">

          <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white">{{ modalConfig.title }}</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex">
            <!-- Form — left -->
            <div class="flex-1 p-6 space-y-5">
              <!-- Date -->
              <div>
                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Transaction Date</label>
                <input v-model="form.date" type="date"
                  class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 outline-none transition-all text-gray-700 dark:text-white" />
              </div>

              <!-- Category -->
              <div>
                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{{ modalConfig.label }}</label>
                <select v-model="form.selectedCategory"
                  class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 outline-none transition-all text-gray-700 dark:text-white">
                  <option value="" disabled>Select a category</option>
                  <option v-for="cat in modalConfig.categories" :key="cat" :value="cat">{{ cat }}</option>
                  <option disabled>──────────</option>
                  <option value="NEW">+ Add New Category</option>
                </select>
                <input v-if="form.selectedCategory === 'NEW'" v-model="form.customCategory" type="text"
                  placeholder="Enter new category name..."
                  class="mt-2 w-full p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none transition-all" />
              </div>

              <!-- Remarks -->
              <div>
                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Remarks / Details</label>
                <textarea v-model="form.remarks" rows="2" placeholder="e.g. March electricity bill, TNB account #12345"
                  class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 outline-none transition-all resize-none text-gray-700 dark:text-white"></textarea>
              </div>

              <!-- Amount -->
              <div>
                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Amount (Rp)</label>
                <div class="relative">
                  <span class="absolute left-4 top-3.5 text-gray-400 dark:text-gray-500 font-bold">Rp</span>
                  <input v-model="form.amount" type="number" min="0" step="0.01" placeholder="0.00"
                    class="w-full pl-12 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 outline-none transition-all font-mono text-lg text-gray-700 dark:text-white" />
                </div>
              </div>

              <!-- Actions -->
              <div class="pt-2 flex gap-3">
                <button @click="closeModal"
                  class="flex-1 py-3 px-4 rounded-lg text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  Cancel
                </button>
                <button @click="saveRecord" :disabled="isSubmitting"
                  :class="modalConfig.themeColor"
                  class="flex-1 py-3 px-4 rounded-lg text-white font-bold shadow-md disabled:opacity-60 transition-all">
                  {{ isSubmitting ? 'Saving...' : 'Save Record' }}
                </button>
              </div>
            </div>

            <!-- Receipt upload — right -->
            <div class="w-48 shrink-0 border-l border-gray-100 dark:border-gray-700 flex flex-col">
              <button type="button" @click="receiptInput.click()"
                class="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer relative group overflow-hidden">
                <img v-if="form.receiptPreview" :src="form.receiptPreview" class="absolute inset-0 w-full h-full object-cover" alt="" />
                <template v-if="!form.receiptPreview">
                  <svg class="w-10 h-10 text-gray-300 dark:text-gray-500 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="text-xs text-gray-400 dark:text-gray-500 group-hover:text-gray-500 font-medium text-center px-3 leading-relaxed">Click to upload receipt</span>
                </template>
                <div v-else class="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-end justify-center pb-3 pointer-events-none">
                  <span class="text-white text-xs font-bold drop-shadow opacity-0 group-hover:opacity-100 transition-opacity">Change</span>
                </div>
              </button>
              <div v-if="form.receiptPreview" class="border-t border-gray-100 dark:border-gray-700 p-2 flex justify-center">
                <button type="button" @click="form.receipt = null; form.receiptPreview = null"
                  class="text-xs text-red-400 hover:text-red-600 transition-colors font-medium">Remove</button>
              </div>
              <input ref="receiptInput" type="file" class="hidden" accept="image/*" @change="handleReceiptUpload" />
            </div>
          </div>

        </div>
      </div>
    </Teleport>

    <!-- VIEW ALL MODAL -->
    <Teleport to="body">
      <div v-if="viewAllType" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div @click="viewAllType = null" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>
        <div class="relative bg-gray-50 dark:bg-gray-900 w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl flex flex-col animate-fade-in-up overflow-hidden border border-gray-200 dark:border-gray-700">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-3">
              <div :class="viewAllType === 'income' ? 'bg-emerald-500' : 'bg-red-500'" class="w-2.5 h-2.5 rounded-full"></div>
              <div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-white">
                  {{ viewAllType === 'income' ? 'All Income' : 'All Expenses' }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ filteredViewAllItems.length }} of {{ viewAllType === 'income' ? financeStore.allIncome.length : financeStore.allExpenses.length }} records
                </p>
              </div>
            </div>
            <button @click="viewAllType = null" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl font-bold leading-none">&times;</button>
          </div>

          <!-- Search + category filters -->
          <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2.5 shrink-0">
            <div class="relative">
              <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
              <input v-model="viewAllSearch" type="text"
                :placeholder="`Search by category or remarks…`"
                class="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all" />
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button @click="viewAllCategoryFilter = ''"
                :class="!viewAllCategoryFilter ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'"
                class="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors">All</button>
              <button v-for="cat in (viewAllType === 'income' ? viewAllIncomeCategories : viewAllExpenseCategories)" :key="cat"
                @click="viewAllCategoryFilter = viewAllCategoryFilter === cat ? '' : cat"
                :class="viewAllCategoryFilter === cat ? 'bg-teal-600 dark:bg-teal-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'"
                class="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors">{{ cat }}</button>
            </div>
          </div>

          <div class="flex-1 overflow-auto p-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
              <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 sticky top-0 z-10">
                  <tr class="border-b border-gray-100 dark:border-gray-700">
                    <th class="p-4 font-medium">Date</th>
                    <th class="p-4 font-medium">Category / Details</th>
                    <th class="p-4 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700 align-top">
                  <tr v-if="filteredViewAllItems.length === 0">
                    <td colspan="3" class="p-8 text-center text-gray-400 dark:text-gray-500">No records match your filter.</td>
                  </tr>
                  <tr v-for="item in filteredViewAllItems" :key="item.id" @click="openDetail(item)" class="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                    <td class="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{{ formatDate(item.date) }}</td>
                    <td class="p-4">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ item.category }}</span>
                        <span v-if="originLabel(item.origin)" class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 tracking-wide">
                          {{ originLabel(item.origin) }}
                        </span>
                        <span v-if="item.type === 'expense'" :class="EXPENSE_GROUPS[getExpenseGroup(item.category)]?.color"
                          class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded tracking-wide">
                          {{ getExpenseGroup(item.category) }}
                        </span>
                      </div>
                      <div v-if="item.remarks" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 wrap-break-word">{{ item.remarks }}</div>
                    </td>
                    <td :class="item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'"
                      class="p-4 text-right font-bold whitespace-nowrap">
                      {{ item.type === 'income' ? '+' : '-' }}{{ formatMoney(item.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- PDF Export Dialog -->
    <Teleport to="body">
      <div v-if="showExportDialog" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="showExportDialog = false" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"></div>
        <div class="relative bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-gray-100 dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white text-lg mb-1">Export Financial Report</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-5">Generates a PDF with income, expenses and breakdown by group.</p>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">From</label>
              <input v-model="exportRange.from" type="date"
                class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white text-sm" />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">To</label>
              <input v-model="exportRange.to" type="date"
                class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white text-sm" />
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button @click="showExportDialog = false" class="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm">Cancel</button>
            <button @click="generatePDF" :disabled="exportingPDF"
              class="flex-1 py-3 rounded-xl bg-[#004D40] dark:bg-teal-700 text-white font-bold text-sm hover:bg-[#00695C] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <svg v-if="exportingPDF" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              {{ exportingPDF ? 'Generating…' : 'Download PDF' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </section>
</template>
