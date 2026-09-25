<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSalesStore } from '../stores/sales'
import CustomerDetailModal from '../../../shared/components/CustomerDetailModal.vue'
import { useProductsStore } from '../../products/stores/products'
import { useCustomersStore } from '../../customer/stores/customers'
import { useDiscountsStore } from '../../customer/stores/discounts'
import { useAuthStore } from '../../auth/stores/auth'
import { useToastStore } from '../../../shared/stores/toast'
import { useCurrency } from '../../../shared/composables/useCurrency'
import { jsPDF } from 'jspdf'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebaseClient'

const salesStore = useSalesStore()
const productsStore = useProductsStore()
const customersStore = useCustomersStore()
const discountsStore = useDiscountsStore()
const authStore = useAuthStore()
const toastStore = useToastStore()
const { fmt: fmtMoney, symbol: currencySymbol } = useCurrency()

const qrisQrUrl = ref('')
const qrisAccountName = ref('')

onMounted(async () => {
  const bizId = authStore.user?.businessId
  if (!bizId) return
  const [bizSnap, prodSnap] = await Promise.all([
    getDoc(doc(db, 'businesses', bizId)),
    getDoc(doc(db, 'businesses', bizId, 'settings', 'products')),
  ])
  if (bizSnap.exists()) {
    qrisQrUrl.value = bizSnap.data().qrisQrUrl || bizSnap.data().duitnowQrUrl || ''
    qrisAccountName.value = bizSnap.data().accountName || ''
  }
  if (prodSnap.exists() && Array.isArray(prodSnap.data().categories)) {
    productCategoriesSales.value = prodSnap.data().categories
  }
})

// --- UI STATE ---
const isModalOpen = ref(false)
const isViewMode = ref(false)
const currentStep = ref(1)
const selectedOrder = ref(null)
const selectedPaymentMethod = ref('Cash')
const selectedCustomerId = ref('')
const isSubmitting = ref(false)
const isViewAllModalOpen = ref(false)
const activeTypeTab = ref('All')
const activeCategoryTab = ref('')
const productCategoriesSales = ref([])

const sortedOrders = computed(() => {
  return [...salesStore.orders].sort((a, b) => {
    const getMs = (ts) => ts ? (ts.toMillis ? ts.toMillis() : new Date(ts).getTime()) : 0;
    const timeA = getMs(a.updatedAt) || getMs(a.createdAt);
    const timeB = getMs(b.updatedAt) || getMs(b.createdAt);
    return timeB - timeA;
  })
})

const searchQuery = ref('')

const tableOrders = computed(() => sortedOrders.value.slice(0, 15))

const filteredOrders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return sortedOrders.value
  return sortedOrders.value.filter(o =>
    (o.orderNumber || '').toLowerCase().includes(q) ||
    (o.customerName || '').toLowerCase().includes(q)
  )
})

// Cart: products with qty added
// Note: VueFire sets 'id' as non-enumerable, so it must be copied explicitly after spread
const cart = computed(() =>
  productsStore.items.map(p => {
    return {
      ...p,
      id: p.id,
      qty: cartQty.value[p.id] || 0,
      stock: getProductStock(p),
      rentalStatus: p.type === 'Rental' ? (p.rentalStatus || 'Available') : null
    }
  })
)

const productTypes = ['All', 'Service', 'Rental']

const activeSalesCategoryFilters = computed(() => {
  const used = new Set(productsStore.items.map(p => p.category).filter(Boolean))
  return productCategoriesSales.value.filter(c => used.has(c))
})

const filteredCart = computed(() => {
  let list = cart.value
  if (activeTypeTab.value !== 'All') list = list.filter(p => p.type === activeTypeTab.value)
  if (activeCategoryTab.value) list = list.filter(p => p.category === activeCategoryTab.value)
  return list
})

const cartQty = ref({})
const cartDuration = ref({})
const cartDurationUnit = ref({})
const now = ref(Date.now())
const completingOrders = ref(new Set())

let clockInterval = null
onMounted(() => { clockInterval = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clockInterval))

const getProductStock = (product) => {
  // Services are unlimited; rentals use their available units count.
  if (product.type === 'Rental') return product.stock ?? 0
  return 9999
}

const increment = (productId) => {
  const product = productsStore.items.find(p => p.id === productId)
  if (!product) return
  const stock = getProductStock(product)
  const current = cartQty.value[productId] || 0
  if (current < stock) {
    cartQty.value[productId] = current + 1
    // Pre-fill service notes from product default on first add
    if (product.type === 'Service' && current === 0 && product.defaultNotes && !serviceOrderNotes.value) {
      serviceOrderNotes.value = product.defaultNotes
    }
  }
}

const decrement = (productId) => {
  const current = cartQty.value[productId] || 0
  if (current > 0) cartQty.value[productId] = current - 1
}

const toggleRental = (productId) => {
  const current = cartQty.value[productId] || 0
  cartQty.value[productId] = current > 0 ? 0 : 1
  if (!cartDuration.value[productId]) cartDuration.value[productId] = 1
  if (!cartDurationUnit.value[productId]) {
    const product = productsStore.items.find(p => p.id === productId)
    cartDurationUnit.value[productId] = product?.rateUnit || 'hour'
  }
}

const getEffectiveRate = (product, selectedUnit) => {
  const base = product.rateUnit || 'hour'
  const rate = product.price || 0
  if (base === selectedUnit) return rate
  if (base === 'hour') {
    if (selectedUnit === 'day') return rate * 24
    if (selectedUnit === 'month') return rate * 24 * 30
  }
  if (base === 'day') {
    if (selectedUnit === 'month') return rate * 30
  }
  return rate
}

const applyLineDiscount = (discount, rawSubtotal) => {
  if (!discount) return 0
  if (discount.type === 'percentage') return Math.round(rawSubtotal * discount.value) / 100
  return Math.min(discount.value, rawSubtotal)
}

const cartItems = computed(() =>
  cart.value.filter(p => (cartQty.value[p.id] || 0) > 0).map(p => {
    const productDiscount = discountsStore.productDiscountMap[p.id] || null

    if (p.type === 'Rental') {
      const duration = cartDuration.value[p.id] || 1
      const billingUnit = cartDurationUnit.value[p.id] || p.rateUnit || 'hour'
      const effectiveRate = getEffectiveRate(p, billingUnit)
      const rawSubtotal = effectiveRate * duration
      const lineDiscountAmount = applyLineDiscount(productDiscount, rawSubtotal)
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        qty: 1,
        price: effectiveRate,
        rateUnit: billingUnit,
        duration,
        rawSubtotal,
        lineDiscountAmount,
        subtotal: rawSubtotal - lineDiscountAmount,
        productDiscount: productDiscount ? { name: productDiscount.name, amount: lineDiscountAmount } : null,
        isRental: true
      }
    }
    if (p.type === 'Service') {
      const rawSubtotal = p.qty * p.price
      const lineDiscountAmount = applyLineDiscount(productDiscount, rawSubtotal)
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        qty: p.qty,
        price: p.price,
        rawSubtotal,
        lineDiscountAmount,
        subtotal: rawSubtotal - lineDiscountAmount,
        productDiscount: productDiscount ? { name: productDiscount.name, amount: lineDiscountAmount } : null,
        isService: true,
        scheduledAt: serviceScheduledAt.value[p.id] || null,
        estimatedDuration: p.serviceDuration ? `${p.serviceDuration} ${p.serviceDurationUnit === 'hour' ? 'hr(s)' : 'day(s)'}` : null,
      }
    }
    const rawSubtotal = p.qty * p.price
    const lineDiscountAmount = applyLineDiscount(productDiscount, rawSubtotal)
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      qty: p.qty,
      price: p.price,
      rawSubtotal,
      lineDiscountAmount,
      subtotal: rawSubtotal - lineDiscountAmount,
      productDiscount: productDiscount ? { name: productDiscount.name, amount: lineDiscountAmount } : null,
      isRental: false
    }
  })
)

const cartRawTotal = computed(() => cartItems.value.reduce((acc, i) => acc + i.rawSubtotal, 0))
const lineDiscountsTotal = computed(() => cartItems.value.reduce((acc, i) => acc + (i.lineDiscountAmount || 0), 0))
const cartTotal = computed(() => cartItems.value.reduce((acc, i) => acc + i.subtotal, 0))

// --- DISCOUNT ---
const selectedDiscountId = ref(null)
const selectedDiscount = computed(() =>
  discountsStore.activeDiscounts.find(d => d.id === selectedDiscountId.value) || null
)
const discountAmount = computed(() => {
  if (!selectedDiscount.value || !selectedCustomerId.value) return 0
  const d = selectedDiscount.value
  if (d.type === 'percentage') return Math.round(cartTotal.value * d.value) / 100
  return Math.min(d.value, cartTotal.value)
})
const finalTotal = computed(() => Math.max(0, cartTotal.value - discountAmount.value))

// --- ORDER HELPERS ---
const formatDate = (ts) => {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

const getInitials = (name = '') => {
  return name.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

const avatarColors = [
  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
]

const getAvatarColor = (name = '') => {
  const code = name.charCodeAt(0) || 0
  return avatarColors[code % avatarColors.length]
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Completed':  return 'text-green-800 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
    case 'Processing': return 'text-yellow-800 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30'
    case 'Active':      return 'text-blue-800 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
    case 'Return Due':  return 'text-rose-800 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30'
    case 'Scheduled':   return 'text-violet-800 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30'
    case 'In Progress': return 'text-orange-800 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30'
    case 'Cancelled':  return 'text-red-800 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
    default:           return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
  }
}

const getRentalCountdown = (order) => {
  const rentalItems = (order.items || []).filter(i => i.isRental && i.rentalEndAt)
  if (!rentalItems.length) return null
  const endAt = rentalItems[0].rentalEndAt
  const endMs = endAt?.toDate ? endAt.toDate().getTime() : Number(endAt)
  const remaining = endMs - now.value
  if (remaining <= 0) return { expired: true, label: 'Time Up' }
  const h = Math.floor(remaining / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  return { expired: false, label: h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s` }
}

watch(now, async () => {
  for (const order of salesStore.orders) {
    if (order.status !== 'Active' || completingOrders.value.has(order.id)) continue
    const countdown = getRentalCountdown(order)
    if (countdown?.expired) {
      completingOrders.value.add(order.id)
      try {
        const isPartial = order.paymentStatus === 'Partial'
        await salesStore.completeRentalOrder(order.id, order.items || [], isPartial)
      } finally {
        completingOrders.value.delete(order.id)
      }
    }
  }
})

const countItems = (items) => (items || []).reduce((acc, i) => acc + (i.qty || 0), 0)

const selectedCustomer = computed(() =>
  customersStore.items.find(c => c.id === selectedCustomerId.value) || null
)

// --- PARTIAL PAYMENT ---
const partialPaymentEnabled = ref(false)
const partialPaymentPercent = ref(50)

const hasRentalItems = computed(() => cartItems.value.some(i => i.isRental))
const canUsePartialPayment = computed(() => hasRentalItems.value && !!selectedCustomerId.value)

const amountDueNow = computed(() => {
  if (!partialPaymentEnabled.value) return finalTotal.value
  return Math.round(finalTotal.value * partialPaymentPercent.value) / 100
})
const remainingBalance = computed(() => finalTotal.value - amountDueNow.value)

const settlingOrderId = ref(null)
const detailCustomerId = ref(null)

// --- COLLECT FINAL PAYMENT (rental return due) ---
const collectOrder = ref(null)
const collectPaymentMethod = ref('Cash')
const collectingPayment = ref(false)

const openCollectPayment = (order) => {
  collectOrder.value = order
  collectPaymentMethod.value = 'Cash'
}

const confirmCollectPayment = async () => {
  if (!collectOrder.value || collectingPayment.value) return
  collectingPayment.value = true
  const tid = toastStore.loading('Processing final payment...')
  try {
    await salesStore.collectFinalPayment(collectOrder.value.id, collectPaymentMethod.value)
    toastStore.replace(tid, 'success', 'Final payment collected — rental complete')
    collectOrder.value = null
  } catch {
    toastStore.replace(tid, 'error', 'Failed to process payment.')
  } finally {
    collectingPayment.value = false
  }
}

// --- SERVICE ---
const serviceScheduledAt = ref({})  // productId → datetime string
const serviceOrderNotes = ref('')
const hasServiceItems = computed(() => cartItems.value.some(i => i.isService))

const cartStatusWarnings = computed(() =>
  cart.value.filter(p => (cartQty.value[p.id] || 0) > 0 && p.customStatus)
    .map(p => ({ name: p.name, status: p.customStatus }))
)

const confirmingCompleteId = ref(null)
const completionNote = ref('')

const handleAdvanceService = (order) => {
  if (order.status === 'In Progress') {
    confirmingCompleteId.value = order.id
    completionNote.value = ''
  } else {
    salesStore.advanceServiceOrder(order.id, order.status)
  }
}

const confirmCompleteService = async () => {
  if (!confirmingCompleteId.value) return
  const tid = toastStore.loading('Completing service...')
  try {
    await salesStore.completeServiceOrder(confirmingCompleteId.value, completionNote.value)
    toastStore.replace(tid, 'success', 'Service marked as completed')
  } catch {
    toastStore.replace(tid, 'error', 'Failed to complete service.')
  } finally {
    confirmingCompleteId.value = null
  }
}
const handleSettleBalance = async (orderId) => {
  if (settlingOrderId.value) return
  settlingOrderId.value = orderId
  const tid = toastStore.loading('Settling balance...')
  try {
    await salesStore.settleBalance(orderId)
    toastStore.replace(tid, 'success', 'Balance settled — order fully paid')
  } catch {
    toastStore.replace(tid, 'error', 'Failed to settle balance')
  } finally {
    settlingOrderId.value = null
  }
}

// --- MODAL ACTIONS ---
const openNewOrderModal = () => {
  isViewMode.value = false
  selectedOrder.value = null
  currentStep.value = 1
  selectedCustomerId.value = ''
  selectedPaymentMethod.value = 'Cash'
  cartQty.value = {}
  cartDuration.value = {}
  cartDurationUnit.value = {}
  activeTypeTab.value = 'All'
  activeCategoryTab.value = ''
  partialPaymentEnabled.value = false
  partialPaymentPercent.value = 50
  serviceScheduledAt.value = {}
  serviceOrderNotes.value = ''
  selectedDiscountId.value = null
  isModalOpen.value = true
}

const viewReceipt = (order) => {
  isViewMode.value = true
  selectedOrder.value = order
  currentStep.value = 3
  isModalOpen.value = true
}

const closeModal = () => { isModalOpen.value = false }
const nextStep = () => { currentStep.value++ }

const handleProceedToPayment = () => {
  if (selectedPaymentMethod.value === 'Cash') {
    confirmPayment()
  } else {
    currentStep.value = 2
  }
}

const printReceipt = () => {
  const data = receiptData.value
  const W = 80
  const margin = 6
  const contentW = W - margin * 2

  // Estimate page height: header(32) + items(~12 each) + totals(~35) + footer(15)
  const itemCount = (data.items || []).length
  const estimatedH = 32 + itemCount * 14 + 55 + 20
  const pageH = Math.max(estimatedH, 120)

  const pdf = new jsPDF({ unit: 'mm', format: [W, pageH], orientation: 'portrait' })
  let y = 6

  // ── Header ──
  pdf.setFillColor(0, 77, 64)
  pdf.rect(0, 0, W, 28, 'F')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6)
  pdf.setTextColor(150, 210, 195)
  pdf.text('RECEIPT', W / 2, y + 2, { align: 'center' })

  pdf.setFontSize(13)
  pdf.setTextColor(255, 255, 255)
  pdf.text('MicroOps', W / 2, y + 9, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.setTextColor(150, 210, 195)
  pdf.text(data.date || '', W / 2, y + 15, { align: 'center' })

  const rawId = data.id && data.id !== '—' ? data.id : ''
  const shortId = rawId ? rawId.slice(-8).toUpperCase() : ''
  if (shortId) pdf.text(`#${shortId}`, W / 2, y + 20, { align: 'center' })

  // Status pill (top-right of header)
  const status = data.paymentStatus === 'Partial' ? 'PARTIAL' : 'PAID'
  const isPartial = data.paymentStatus === 'Partial'
  pdf.setFillColor(isPartial ? 251 : 52, isPartial ? 191 : 211, isPartial ? 36 : 153)
  pdf.rect(W - margin - 14, 3, 14, 5, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  pdf.setTextColor(30, 30, 30)
  pdf.text(status, W - margin - 7, 6.5, { align: 'center' })

  y = 32

  // ── Divider ──
  pdf.setDrawColor(200, 200, 200)
  pdf.line(margin, y, W - margin, y)
  y += 5

  // ── Items ──
  for (const item of (data.items || [])) {
    const price = item.subtotal ?? (item.price || 0) * (item.qty || 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(30, 30, 30)
    const nameLines = pdf.splitTextToSize(item.name, contentW - 20)
    pdf.text(nameLines, margin, y)
    pdf.text(fmtMoney(price), W - margin, y, { align: 'right' })
    y += nameLines.length * 4.5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)

    if (item.isRental) {
      pdf.setTextColor(160, 110, 0)
      pdf.text(`${item.duration} ${item.rateUnit}${item.duration > 1 ? 's' : ''} × ${fmtMoney(item.price)}/${item.rateUnit}`, margin, y)
      y += 4
    } else if (item.isService) {
      pdf.setTextColor(100, 60, 160)
      if (item.estimatedDuration) { pdf.text(`Est. ${item.estimatedDuration}`, margin, y); y += 3.5 }
      if (item.scheduledAt) {
        const d = new Date(item.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        pdf.text(`Scheduled: ${d}`, margin, y); y += 3.5
      }
    } else {
      pdf.setTextColor(120, 120, 120)
      pdf.text(`x${item.qty} × ${fmtMoney(item.price)}`, margin, y)
      y += 4
    }

    if (item.productDiscount) {
      pdf.setTextColor(160, 160, 160)
      pdf.setFontSize(6)
      pdf.text(`was ${fmtMoney(item.rawSubtotal ?? 0)}`, W - margin, y - 3.5, { align: 'right' })
    }

    pdf.setTextColor(30, 30, 30)
    y += 2
  }

  y += 2
  pdf.setDrawColor(200, 200, 200)
  pdf.line(margin, y, W - margin, y)
  y += 4

  // ── Totals ──
  const line = (label, value, bold = false, r = 80, g = 80, b = 80) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(bold ? 9 : 7.5)
    pdf.setTextColor(r, g, b)
    pdf.text(label, margin, y)
    pdf.text(value, W - margin, y, { align: 'right' })
    y += bold ? 5.5 : 4.5
  }

  line('Subtotal', fmtMoney(data.subtotal))
  if ((data.lineDiscountsTotal || 0) > 0)
    line('Item Discounts', `-${fmtMoney(data.lineDiscountsTotal)}`, false, 5, 140, 90)
  if ((data.discountAmount || 0) > 0)
    line(`Order Discount (${data.discountName})`, `-${fmtMoney(data.discountAmount)}`, false, 5, 140, 90)

  pdf.setDrawColor(180, 180, 180)
  pdf.line(margin, y, W - margin, y); y += 3
  line('Total', fmtMoney(data.total))
  pdf.line(margin, y, W - margin, y); y += 3
  line('Paid Now', fmtMoney(data.paidAmount), true, 0, 77, 64)

  if ((data.remainingAmount || 0) > 0) {
    y += 2
    pdf.setFillColor(255, 243, 205)
    pdf.rect(margin, y, contentW, 7, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(140, 80, 0)
    pdf.text('Balance Due', margin + 2, y + 5)
    pdf.text(fmtMoney(data.remainingAmount), W - margin - 2, y + 5, { align: 'right' })
    y += 10
  }

  // ── Service / completion notes ──
  const order = selectedOrder.value
  if (order?.serviceNotes || order?.completionNote) {
    y += 2
    pdf.setDrawColor(200, 200, 200)
    pdf.line(margin, y, W - margin, y); y += 4
    if (order.serviceNotes) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.setTextColor(100, 50, 160)
      pdf.text('SERVICE NOTES', margin, y); y += 3.5
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(60, 60, 60)
      const ls = pdf.splitTextToSize(order.serviceNotes, contentW)
      pdf.text(ls, margin, y); y += ls.length * 3.5 + 2
    }
    if (order.completionNote) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.setTextColor(0, 100, 80)
      pdf.text('COMPLETION NOTE', margin, y); y += 3.5
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(60, 60, 60)
      const ls = pdf.splitTextToSize(order.completionNote, contentW)
      pdf.text(ls, margin, y); y += ls.length * 3.5 + 2
    }
  }

  // ── Footer ──
  y += 4
  pdf.setDrawColor(200, 200, 200)
  pdf.line(margin, y, W - margin, y); y += 5
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(160, 160, 160)
  pdf.text('Thank you for your purchase!', W / 2, y, { align: 'center' })

  const filename = shortId ? `receipt-${shortId}.pdf` : 'receipt.pdf'
  pdf.save(filename)
}

const shareReceipt = async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Receipt from MicroOps',
        text: `Order ${receiptData.value.id} - Total ${fmtMoney(receiptData.value.total)}`,
      })
    } catch (err) {
      console.log('Error sharing:', err)
    }
  } else {
    alert('Sharing is not supported on this device/browser.')
  }
}

const confirmPayment = async () => {
  if (isSubmitting.value) return
  isSubmitting.value = true
  const tid = toastStore.loading('Processing order...')
  let success = false
  try {
    await salesStore.createOrder({
      customerName: selectedCustomer.value?.full_name || selectedCustomer.value?.name || 'Walk-in Customer',
      customerId: selectedCustomerId.value || null,
      items: cartItems.value,
      paymentMethod: selectedPaymentMethod.value,
      partialPayment: canUsePartialPayment.value && partialPaymentEnabled.value
        ? { enabled: true, percent: partialPaymentPercent.value, paidAmount: amountDueNow.value }
        : { enabled: false },
      serviceNotes: hasServiceItems.value ? serviceOrderNotes.value : null,
      subtotalRaw: cartRawTotal.value,
      lineDiscountsTotal: lineDiscountsTotal.value,
      discount: selectedDiscount.value
        ? { id: selectedDiscount.value.id, name: selectedDiscount.value.name, type: selectedDiscount.value.type, value: selectedDiscount.value.value, amount: discountAmount.value }
        : null,
    })
    success = true
  } catch (err) {
    console.error('Failed to create order:', err)
  } finally {
    isSubmitting.value = false
    if (success) {
      toastStore.replace(tid, 'success', 'Order created successfully')
      currentStep.value = 3
    } else {
      toastStore.replace(tid, 'error', 'Failed to process order. Please try again.')
    }
  }
}

// Receipt data for step 3
const receiptData = computed(() => {
  if (isViewMode.value && selectedOrder.value) {
    return {
      id: selectedOrder.value.orderNumber,
      date: formatDate(selectedOrder.value.createdAt),
      subtotal: selectedOrder.value.subtotal ?? selectedOrder.value.total,
      lineDiscountsTotal: selectedOrder.value.lineDiscountsTotal || 0,
      discountAmount: selectedOrder.value.discountAmount || 0,
      discountName: selectedOrder.value.discountName || null,
      total: selectedOrder.value.total,
      paidAmount: selectedOrder.value.paidAmount ?? selectedOrder.value.total,
      remainingAmount: selectedOrder.value.remainingAmount ?? 0,
      paymentStatus: selectedOrder.value.paymentStatus || 'Paid',
      items: selectedOrder.value.items || [],
    }
  }
  return {
    id: '—',
    date: new Date().toLocaleDateString('en-MY'),
    subtotal: cartRawTotal.value,
    lineDiscountsTotal: lineDiscountsTotal.value,
    discountAmount: discountAmount.value,
    discountName: selectedDiscount.value?.name || null,
    total: finalTotal.value,
    paidAmount: amountDueNow.value,
    remainingAmount: partialPaymentEnabled.value ? remainingBalance.value : 0,
    paymentStatus: partialPaymentEnabled.value ? 'Partial' : 'Paid',
    items: cartItems.value,
  }
})
</script>

<template>
  <section class="space-y-12">
    <header class="mb-6">
      <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Sales & Order Management</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-400 mb-4">Track customer orders from quotation to final invoice.</p>
      
      <button @click="openNewOrderModal"
        class="bg-[#004D40] dark:bg-teal-700 hover:bg-[#00695C] dark:hover:bg-teal-600 text-white font-bold py-2 px-6 rounded-lg shadow transition-colors flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        New Order
      </button>
    </header>

    <!-- Orders Table -->
    <div class="mb-4 flex justify-between items-center">
      <p class="text-sm text-gray-500 dark:text-gray-400">Showing latest 15 orders.</p>
      <span @click="isViewAllModalOpen = true" class="text-xs font-bold text-[#4DB6AC] dark:text-teal-400 cursor-pointer hover:underline">View All Orders</span>
    </div>

    
    <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm overflow-x-auto border border-gray-100 dark:border-gray-700 transition-colors">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-gray-100 dark:border-gray-700">
            <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Order Details</th>
            <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Customer</th>
            <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</th>
            <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Total</th>
            <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">Receipt</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
          <tr v-if="tableOrders.length === 0">
            <td colspan="5" class="p-8 text-center text-gray-400 dark:text-gray-500">No orders yet. Create your first order!</td>
          </tr>
          <tr v-for="order in tableOrders" :key="order.id"
            class="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors">
            <td class="p-4">
              <div class="font-bold text-gray-800 dark:text-gray-200 font-mono">{{ order.orderNumber }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ formatDate(order.createdAt) }}</div>
            </td>
            <td class="p-4">
              <div class="flex items-center gap-3"
                :class="order.customerId ? 'cursor-pointer group/cust' : ''"
                @click="order.customerId ? detailCustomerId = order.customerId : null">
                <div :class="[getAvatarColor(order.customerName), 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm']">
                  {{ getInitials(order.customerName) || '?' }}
                </div>
                <div>
                  <div class="font-bold text-gray-800 dark:text-gray-200 text-sm"
                    :class="order.customerId ? 'group-hover/cust:text-teal-600 dark:group-hover/cust:text-teal-400 transition-colors' : ''">
                    {{ order.customerName || 'Walk-in Customer' }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{{ countItems(order.items) }} item(s)</div>
                </div>
              </div>
            </td>
            <td class="p-4">
              <div class="flex flex-col items-start gap-1">
                <span :class="['px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full', getStatusColor(order.status)]">
                  {{ order.status }}
                </span>
                <span v-if="order.status === 'Return Due'"
                  class="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                  Balance {{ fmtMoney(order.remainingAmount) }}
                </span>
                <span v-else-if="order.paymentStatus === 'Partial'"
                  class="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  Partial · {{ fmtMoney(order.remainingAmount) }} due
                </span>
                <span v-if="order.status === 'Active' && getRentalCountdown(order)"
                  :class="getRentalCountdown(order).expired ? 'text-red-500 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'"
                  class="text-xs font-mono font-bold tabular-nums">
                  ⏱ {{ getRentalCountdown(order).label }}
                </span>
              </div>
            </td>
            <td class="p-4 text-right">
              <div class="font-bold text-gray-800 dark:text-gray-200">{{ fmtMoney(order.total) }}</div>
            </td>
            <td class="p-4 text-center">
              <div class="flex items-center justify-center gap-1">
                <button v-if="order.hasServices && (order.status === 'Scheduled' || order.status === 'In Progress')"
                  @click="handleAdvanceService(order)"
                  :class="order.status === 'Scheduled'
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200'
                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200'"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  :title="order.status === 'Scheduled' ? 'Mark In Progress' : 'Mark Completed'">
                  {{ order.status === 'Scheduled' ? '▶' : '✓' }}
                </button>
                <!-- Collect final payment for rental return-due orders -->
                <button v-if="order.status === 'Return Due'"
                  @click="openCollectPayment(order)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                  title="Collect remaining balance">
                  Collect
                </button>
                <!-- Settle for non-rental partial orders -->
                <button v-else-if="order.paymentStatus === 'Partial'"
                  @click="handleSettleBalance(order.id)"
                  :disabled="settlingOrderId === order.id"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                  title="Settle remaining balance">
                  {{ settlingOrderId === order.id ? '…' : 'Settle' }}
                </button>
                <button @click="viewReceipt(order)"
                  class="text-gray-400 dark:text-gray-500 hover:text-[#4DB6AC] dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 p-2 rounded-lg transition-colors"
                  title="View Receipt">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="isModalOpen" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="closeModal" class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

        <div class="relative bg-white dark:bg-gray-800 w-full max-w-4xl rounded-lg shadow-2xl overflow-hidden transition-colors flex flex-col" style="height:90vh;max-height:680px">

          <!-- Modal Header -->
          <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-teal-50 dark:bg-teal-900/20">
            <div>
              <h3 class="text-lg font-bold text-[#004D40] dark:text-teal-300">
                {{ isViewMode ? 'Order Details' : 'New Transaction' }}
              </h3>
              <p v-if="!isViewMode" class="text-xs text-teal-700 dark:text-teal-400">Select items &amp; confirm payment</p>
              <p v-else class="text-xs text-teal-700 dark:text-teal-400">View Only</p>
            </div>
            <button @click="closeModal" class="text-gray-400 hover:text-red-500 text-2xl font-bold leading-none">&times;</button>
          </div>

        <!-- POS Layout: product catalog left + order summary right -->
          <div v-if="currentStep === 1" class="flex flex-1 overflow-hidden" style="min-height:0">

            <!-- LEFT: product catalog -->
            <div class="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-gray-100 dark:border-gray-700">

              <!-- Customer row + type tabs + category chips -->
              <div class="px-4 pt-3 pb-2 shrink-0 space-y-2 border-b border-gray-100 dark:border-gray-700">
                <select v-model="selectedCustomerId"
                  class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4DB6AC]">
                  <option value="">Walk-in Customer</option>
                  <option v-for="c in customersStore.items" :key="c.id" :value="c.id">{{ c.full_name || c.name }}</option>
                </select>
                <div class="flex gap-1.5 overflow-x-auto pb-0.5">
                  <button v-for="tab in productTypes" :key="tab"
                    @click="activeTypeTab = tab"
                    :class="activeTypeTab === tab
                      ? 'bg-[#004D40] text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/20'"
                    class="shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors">
                    {{ tab }}
                  </button>
                </div>
                <div v-if="activeSalesCategoryFilters.length > 0" class="flex gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    @click="activeCategoryTab = ''"
                    :class="activeCategoryTab === '' ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'"
                    class="shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors">
                    All Categories
                  </button>
                  <button v-for="cat in activeSalesCategoryFilters" :key="cat"
                    @click="activeCategoryTab = activeCategoryTab === cat ? '' : cat"
                    :class="activeCategoryTab === cat ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'"
                    class="shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors">
                    {{ cat }}
                  </button>
                </div>
              </div>

              <!-- Product grid -->
              <div class="overflow-y-auto flex-1 p-3">
                <div v-if="filteredCart.length === 0" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No products.</div>
                <div class="grid grid-cols-2 gap-2">
                  <div v-for="product in filteredCart" :key="product.id"
                    class="relative bg-white dark:bg-gray-700 border rounded-xl overflow-hidden transition-all"
                    :class="(cartQty[product.id] || 0) > 0 ? 'border-[#4DB6AC] ring-1 ring-[#4DB6AC]/30' : 'border-gray-200 dark:border-gray-600'">

                    <!-- Product image -->
                    <div class="w-full h-24 bg-gray-100 dark:bg-gray-600 relative overflow-hidden">
                      <img v-if="product.imageUrl" :src="product.imageUrl" class="w-full h-full object-cover" alt="" />
                      <div v-else class="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-300 dark:text-gray-500">
                        {{ product.name?.charAt(0)?.toUpperCase() || '?' }}
                      </div>
                      <!-- Type badge -->
                      <span class="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                        :class="{
                          'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400': product.type === 'Service',
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': product.type === 'Rental',
                        }">{{ product.type }}</span>
                    </div>

                    <!-- Info + controls -->
                    <div class="p-2">
                      <div class="font-bold text-gray-800 dark:text-gray-100 text-xs truncate">{{ product.name }}</div>
                      <div class="text-[#004D40] dark:text-teal-400 font-bold text-sm mt-0.5">
                        {{ fmtMoney(product.price) }}<span v-if="product.type === 'Rental'" class="text-[10px] font-normal text-gray-400">/{{ product.rateUnit }}</span>
                      </div>
                      <span v-if="product.customStatus" class="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 leading-none">
                        ⚠ {{ product.customStatus }}
                      </span>

                      <!-- Rental controls -->
                      <div v-if="product.type === 'Rental'" class="mt-2">
                        <div v-if="product.rentalStatus === 'Rented'" class="text-[10px] font-bold text-amber-600 dark:text-amber-400 text-center py-1">Currently Rented</div>
                        <template v-else>
                          <button @click="toggleRental(product.id)"
                            :class="(cartQty[product.id] || 0) > 0 ? 'bg-[#004D40] text-white' : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200'"
                            class="w-full py-1 rounded-lg text-[11px] font-bold transition-colors">
                            {{ (cartQty[product.id] || 0) > 0 ? '✓ Reserved' : 'Reserve' }}
                          </button>
                          <div v-if="(cartQty[product.id] || 0) > 0" class="mt-1 space-y-1">
                            <div class="flex gap-0.5">
                              <button v-for="unit in ['hour', 'day', 'month']" :key="unit"
                                @click="cartDurationUnit[product.id] = unit"
                                :class="(cartDurationUnit[product.id] || product.rateUnit) === unit
                                  ? 'bg-[#004D40] text-white'
                                  : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'"
                                class="flex-1 py-0.5 text-[9px] font-bold rounded capitalize transition-colors">
                                {{ unit === 'hour' ? 'Hr' : unit === 'day' ? 'Day' : 'Mo' }}
                              </button>
                            </div>
                            <div class="flex items-center gap-1">
                              <input v-model.number="cartDuration[product.id]" type="number" min="1" :max="product.maxDuration || 999"
                                class="w-full text-center p-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-xs font-bold" />
                              <span class="text-[10px] text-gray-400 whitespace-nowrap">{{ (cartDurationUnit[product.id] || product.rateUnit) }}(s)</span>
                            </div>
                          </div>
                        </template>
                      </div>

                      <!-- Service controls: add/remove + schedule date -->
                      <div v-else-if="product.type === 'Service'" class="mt-2 space-y-1">
                        <div class="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-600">
                          <button @click="decrement(product.id)" :disabled="(cartQty[product.id] || 0) === 0"
                            class="w-7 h-7 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 disabled:opacity-40 text-sm font-bold">−</button>
                          <span class="w-7 text-center text-xs font-bold text-gray-700 dark:text-gray-200">{{ cartQty[product.id] || 0 }}</span>
                          <button @click="increment(product.id)"
                            class="w-7 h-7 flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-900/30 text-gray-500 text-sm font-bold">+</button>
                        </div>
                        <input v-if="(cartQty[product.id] || 0) > 0"
                          v-model="serviceScheduledAt[product.id]"
                          type="datetime-local"
                          class="w-full text-[10px] p-1 border border-violet-200 dark:border-violet-700 rounded bg-violet-50 dark:bg-violet-900/20 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT: order summary + payment -->
            <div class="w-64 shrink-0 flex flex-col bg-gray-50 dark:bg-gray-900/40">
              <div class="px-4 pt-4 pb-2 shrink-0">
                <h4 class="font-bold text-gray-800 dark:text-white text-sm">Order Summary</h4>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ cartItems.length }} item(s)</p>
              </div>

              <!-- Cart items -->
              <div class="flex-1 overflow-y-auto px-4 space-y-2 min-h-0">
                <div v-if="cartItems.length === 0" class="text-center py-8 text-gray-400 dark:text-gray-500 text-xs">No items added yet.</div>
                <div v-for="item in cartItems" :key="item.productId"
                  :class="item.productDiscount ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'"
                  class="flex items-center gap-2 rounded-lg px-2 py-2 border">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{{ item.name }}</div>
                    <div class="text-[10px] text-gray-400">
                      <span v-if="item.isRental">{{ item.duration }} {{ item.rateUnit }}(s)</span>
                      <span v-else-if="item.isService" class="flex flex-col gap-0.5">
                        <span v-if="item.scheduledAt" class="text-violet-500 dark:text-violet-400">
                          {{ new Date(item.scheduledAt).toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' }) }}
                        </span>
                        <span v-else class="text-amber-500">No date set</span>
                        <span v-if="item.estimatedDuration" class="text-gray-400">~{{ item.estimatedDuration }}</span>
                      </span>
                      <span v-else>x{{ item.qty }}</span>
                    </div>
                    <div v-if="item.productDiscount" class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                      {{ item.productDiscount.name }} −{{ fmtMoney(item.productDiscount.amount) }}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div v-if="item.productDiscount" class="text-[10px] text-gray-400 line-through">{{ fmtMoney(item.rawSubtotal) }}</div>
                    <div class="text-xs font-bold text-[#004D40] dark:text-teal-400">{{ fmtMoney(item.subtotal) }}</div>
                  </div>
                </div>
              </div>

              <!-- Payment summary -->
              <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 space-y-3">
                <div class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payment Method</div>
                <div class="grid grid-cols-3 gap-1">
                  <button v-for="method in ['Cash', 'QRIS', 'Card']" :key="method"
                    @click="selectedPaymentMethod = method"
                    :class="selectedPaymentMethod === method ? 'bg-[#004D40] text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'"
                    class="py-1.5 rounded-lg text-[10px] font-bold transition-all">{{ method }}</button>
                </div>



                <!-- Discount selector — registered customers only, order-level discounts -->
                <div v-if="selectedCustomerId" class="space-y-1.5">
                  <label class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Order Discount</label>
                  <select v-model="selectedDiscountId"
                    class="w-full text-xs p-2 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                    <option :value="null">No discount</option>
                    <option
                      v-for="d in discountsStore.activeDiscounts.filter(d => !d.productId && (!d.customerId || d.customerId === selectedCustomerId))"
                      :key="d.id" :value="d.id">
                      {{ d.name }}{{ d.customerId ? ' ★' : '' }} — {{ d.type === 'percentage' ? d.value + '% off' : fmtMoney(d.value) + ' off' }}
                    </option>
                  </select>
                  <p v-if="discountsStore.activeDiscounts.filter(d => !d.productId && d.customerId === selectedCustomerId).length > 0"
                    class="text-[10px] text-teal-600 dark:text-teal-400">★ = exclusive discount for this customer</p>
                </div>

                <!-- Service notes — shown when cart has service items -->
                <div v-if="hasServiceItems" class="space-y-1">
                  <label class="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Service Notes</label>
                  <textarea v-model="serviceOrderNotes" rows="2" placeholder="Instructions, special requests…"
                    class="w-full text-xs p-2 border border-violet-200 dark:border-violet-700 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-gray-700 dark:text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"></textarea>
                </div>

                <!-- Partial payment toggle — rental + registered customer only -->
                <div v-if="canUsePartialPayment"
                  @click="partialPaymentEnabled = !partialPaymentEnabled"
                  :class="partialPaymentEnabled ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'"
                  class="flex items-center justify-between border rounded-lg px-3 py-2 cursor-pointer select-none transition-colors">
                  <div>
                    <p class="text-[11px] font-bold" :class="partialPaymentEnabled ? 'text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'">Partial Payment</p>
                    <p class="text-[10px] text-gray-400">Deposit only — balance due on return</p>
                  </div>
                  <div :class="partialPaymentEnabled ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-500'" class="relative w-8 h-5 rounded-full transition-colors shrink-0">
                    <span :class="partialPaymentEnabled ? 'translate-x-3.5' : 'translate-x-0.5'" class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"></span>
                  </div>
                </div>

                <!-- Percent slider -->
                <div v-if="partialPaymentEnabled && canUsePartialPayment" class="space-y-1.5">
                  <div class="flex justify-between text-[10px] font-bold text-gray-500 dark:text-gray-400">
                    <span>Deposit %</span><span class="text-amber-600 dark:text-amber-400">{{ partialPaymentPercent }}%</span>
                  </div>
                  <input v-model.number="partialPaymentPercent" type="range" min="10" max="90" step="5"
                    class="w-full accent-amber-500 h-1.5 rounded-full" />
                  <div class="flex justify-between text-[9px] text-gray-400">
                    <span>10%</span><span>90%</span>
                  </div>
                </div>

                <div class="space-y-1 text-sm">
                  <div class="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Subtotal</span><span>{{ fmtMoney(cartRawTotal) }}</span>
                  </div>
                  <div v-if="lineDiscountsTotal > 0" class="flex justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                    <span>Item Discounts</span><span>-{{ fmtMoney(lineDiscountsTotal) }}</span>
                  </div>
                  <div v-if="discountAmount > 0" class="flex justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                    <span>Order Discount ({{ selectedDiscount?.name }})</span><span>-{{ fmtMoney(discountAmount) }}</span>
                  </div>
                  <template v-if="partialPaymentEnabled && canUsePartialPayment">
                    <div class="flex justify-between text-gray-700 dark:text-gray-300 font-bold border-t border-gray-100 dark:border-gray-700 pt-1">
                      <span>Total</span><span>{{ fmtMoney(finalTotal) }}</span>
                    </div>
                    <div class="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                      <span>Pay Now ({{ partialPaymentPercent }}%)</span><span>{{ fmtMoney(amountDueNow) }}</span>
                    </div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500 text-xs">
                      <span>Balance Due</span><span>{{ fmtMoney(remainingBalance) }}</span>
                    </div>
                  </template>
                  <div v-else class="flex justify-between font-bold text-gray-800 dark:text-white text-base border-t border-gray-100 dark:border-gray-700 pt-1">
                    <span>Due Now</span><span>{{ fmtMoney(finalTotal) }}</span>
                  </div>
                </div>

                <!-- Status warnings -->
                <div v-if="cartStatusWarnings.length > 0" class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
                  <p class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    Item Status Warning
                  </p>
                  <div v-for="w in cartStatusWarnings" :key="w.name" class="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <span class="shrink-0 mt-0.5">•</span>
                    <span><strong>{{ w.name }}</strong> — {{ w.status }}</span>
                  </div>
                </div>

                <button @click="handleProceedToPayment" :disabled="cartItems.length === 0 || isSubmitting"
                  class="w-full bg-[#004D40] dark:bg-teal-700 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {{ selectedPaymentMethod === 'Cash' ? (isSubmitting ? 'Processing...' : 'Confirm Payment') : 'Proceed to Payment' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Step 2: Payment Waiting State (QRIS / Card) -->
          <div v-if="currentStep === 2" class="p-5 flex flex-col items-center justify-center flex-1 min-h-0 bg-gray-50 dark:bg-gray-900/50">
            <h4 class="text-xl font-black text-gray-800 dark:text-white tracking-tight mb-1">Awaiting Payment</h4>
            <p class="text-gray-500 dark:text-gray-400 mb-1 font-medium text-sm">
              Amount Due Now: <span class="text-gray-900 dark:text-white font-bold text-lg">{{ fmtMoney(amountDueNow) }}</span>
            </p>
            <p v-if="partialPaymentEnabled && canUsePartialPayment" class="text-amber-600 dark:text-amber-400 text-xs font-medium mb-3">
              Balance {{ fmtMoney(remainingBalance) }} to be collected on return
            </p>
            <p v-else class="mb-3"></p>

            <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center max-w-sm w-full">
              <!-- QRIS State -->
              <template v-if="selectedPaymentMethod === 'QRIS'">
                <div class="w-52 h-52 bg-gray-50 dark:bg-gray-900 rounded-xl mb-3 p-3 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 shrink-0">
                  <img v-if="qrisQrUrl" :src="qrisQrUrl" class="w-full h-full object-contain" alt="QRIS QR" />
                  <div v-else class="text-center text-gray-400 text-sm font-bold">No QR Code uploaded</div>
                </div>
                <p class="text-gray-600 dark:text-gray-300 text-xs font-medium mb-1 text-center">Please ask the customer to scan the QRIS QR above.</p>
                <p v-if="qrisAccountName" class="text-gray-800 dark:text-white text-sm font-bold mb-4 text-center">{{ qrisAccountName }}</p>
                <p v-else class="mb-4"></p>
              </template>

              <!-- Card State -->
              <template v-if="selectedPaymentMethod === 'Card'">
                <div class="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-3 animate-pulse shrink-0">
                  <svg class="w-12 h-12 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <p class="text-gray-600 dark:text-gray-300 text-xs font-medium mb-4 text-center">Please tap or insert the card into the payment terminal.</p>
              </template>

              <button @click="confirmPayment" :disabled="isSubmitting"
                class="w-full bg-[#004D40] dark:bg-teal-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-all disabled:opacity-60 text-base">
                {{ isSubmitting ? 'Processing...' : 'Payment Received' }}
              </button>

              <button @click="currentStep = 1" :disabled="isSubmitting"
                class="mt-3 text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Cancel / Change Method
              </button>
            </div>
          </div>

          <!-- Step 3: Receipt -->
          <div v-if="currentStep === 3" class="flex flex-col flex-1 min-h-0 bg-gray-100 dark:bg-gray-900">
            <!-- Scrollable receipt area -->
            <div class="flex-1 overflow-y-auto p-5">
              <!-- Receipt card -->
              <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden max-w-sm mx-auto">

                <!-- Header band -->
                <div class="bg-[#004D40] px-6 pt-6 pb-8 text-center relative">
                  <span class="absolute top-4 right-4 text-[10px] font-black px-2.5 py-1 rounded-full"
                    :class="receiptData.paymentStatus === 'Partial' ? 'bg-amber-400 text-amber-900' : 'bg-emerald-400 text-emerald-900'">
                    {{ receiptData.paymentStatus === 'Partial' ? 'PARTIAL' : 'PAID' }}
                  </span>
                  <p class="text-[10px] font-bold text-teal-300 uppercase tracking-widest mb-1">Receipt</p>
                  <h2 class="text-2xl font-black text-white tracking-tight">MicroOps</h2>
                  <p class="text-teal-300 text-[11px] mt-1">{{ receiptData.date }}</p>
                  <p class="text-teal-400 text-[10px] mt-0.5 font-mono">{{ receiptData.id ? `#${receiptData.id.slice(-8).toUpperCase()}` : '' }}</p>
                </div>

                <!-- Scallop edge -->
                <div class="flex">
                  <div class="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-900/60 -mt-2 -ml-2 shrink-0"></div>
                  <div class="flex-1 border-t-2 border-dashed border-gray-200 dark:border-gray-700 mt-0"></div>
                  <div class="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-900/60 -mt-2 -mr-2 shrink-0"></div>
                </div>

                <!-- Items -->
                <div class="px-6 py-4 space-y-3">
                  <div v-for="(item, idx) in receiptData.items" :key="idx">
                    <div class="flex justify-between items-start gap-2">
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-gray-800 dark:text-white leading-tight">{{ item.name }}</p>
                        <!-- Rental meta -->
                        <p v-if="item.isRental" class="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {{ item.duration }} {{ item.rateUnit }}{{ item.duration > 1 ? 's' : '' }} × {{ fmtMoney(item.price) }}/{{ item.rateUnit }}
                        </p>
                        <!-- Service meta -->
                        <template v-else-if="item.isService">
                          <p v-if="item.estimatedDuration" class="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5">Est. {{ item.estimatedDuration }}</p>
                          <p v-if="item.scheduledAt" class="text-[11px] text-gray-400 mt-0.5">Scheduled: {{ new Date(item.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }}</p>
                        </template>
                        <!-- Regular qty -->
                        <p v-else class="text-[11px] text-gray-400 mt-0.5">x{{ item.qty }} × {{ fmtMoney(item.price) }}</p>
                      </div>
                      <div class="text-right shrink-0">
                        <p v-if="item.productDiscount" class="text-[10px] text-gray-400 line-through">{{ fmtMoney(item.rawSubtotal ?? (item.price || 0) * (item.qty || 0)) }}</p>
                        <p class="text-sm font-bold text-gray-800 dark:text-white">{{ fmtMoney(item.subtotal ?? (item.price || 0) * (item.qty || 0)) }}</p>
                      </div>
                    </div>
                  </div>
                  <div v-if="!receiptData.items?.length" class="text-center italic text-gray-400 text-sm py-2">No items</div>
                </div>

                <!-- Divider -->
                <div class="mx-6 border-t border-dashed border-gray-200 dark:border-gray-700"></div>

                <!-- Totals -->
                <div class="px-6 py-4 space-y-2">
                  <div class="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Subtotal</span><span>{{ fmtMoney(receiptData.subtotal) }}</span>
                  </div>
                  <div v-if="receiptData.lineDiscountsTotal > 0" class="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>Item Discounts</span><span>-{{ fmtMoney(receiptData.lineDiscountsTotal) }}</span>
                  </div>
                  <div v-if="receiptData.discountAmount > 0" class="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>Order Discount ({{ receiptData.discountName }})</span><span>-{{ fmtMoney(receiptData.discountAmount) }}</span>
                  </div>
                  <div class="flex justify-between text-sm text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <span>Total</span><span>{{ fmtMoney(receiptData.total) }}</span>
                  </div>
                  <div class="flex justify-between text-base font-black text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-600">
                    <span>Paid Now</span><span>{{ fmtMoney(receiptData.paidAmount) }}</span>
                  </div>
                  <div v-if="receiptData.remainingAmount > 0" class="flex justify-between text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg mt-1">
                    <span>Balance Due</span><span>{{ fmtMoney(receiptData.remainingAmount) }}</span>
                  </div>
                </div>

                <!-- Service / completion notes -->
                <template v-if="isViewMode && (selectedOrder?.serviceNotes || selectedOrder?.completionNote)">
                  <div class="mx-6 border-t border-dashed border-gray-200 dark:border-gray-700"></div>
                  <div class="px-6 py-3 space-y-2">
                    <div v-if="selectedOrder?.serviceNotes">
                      <p class="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-0.5">Service Notes</p>
                      <p class="text-xs text-gray-600 dark:text-gray-300">{{ selectedOrder.serviceNotes }}</p>
                    </div>
                    <div v-if="selectedOrder?.completionNote">
                      <p class="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-0.5">Completion Note</p>
                      <p class="text-xs text-gray-600 dark:text-gray-300">{{ selectedOrder.completionNote }}</p>
                    </div>
                  </div>
                </template>

                <!-- Footer -->
                <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 text-center">
                  <p class="text-[10px] text-gray-400 dark:text-gray-500">Thank you for your purchase!</p>
                </div>
              </div>
            </div>

            <!-- Actions — pinned to bottom -->
            <div class="shrink-0 px-5 pb-5 pt-3 flex flex-col gap-2 max-w-sm mx-auto w-full">
              <div class="flex gap-2">
                <button @click="printReceipt"
                  class="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-bold py-2.5 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 text-sm">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                  Export PDF
                </button>
                <button @click="shareReceipt"
                  class="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-bold py-2.5 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 text-sm">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  Share
                </button>
              </div>
              <button @click="closeModal"
                class="w-full bg-[#004D40] dark:bg-teal-700 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors text-base">
                Done
              </button>
            </div>
          </div>

        </div>
      </div>
    </Teleport>

    <!-- VIEW ALL MODAL -->
    <Teleport to="body">
      <div v-if="isViewAllModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div @click="isViewAllModalOpen = false" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>
        <div class="relative bg-gray-50 dark:bg-gray-900 w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col animate-fade-in-up overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center shrink-0">
            <div>
              <h3 class="text-xl font-bold text-gray-800 dark:text-white">All Sales Orders</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Showing all historical orders</p>
            </div>
            <button @click="isViewAllModalOpen = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl font-bold leading-none">&times;</button>
          </div>
          <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input v-model="searchQuery" type="text" placeholder="Search by order # or customer…" class="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4DB6AC] transition-colors" />
            </div>
          </div>
          
          <div class="flex-1 overflow-auto p-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
              <table class="w-full text-left text-sm whitespace-nowrap">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th class="p-4 font-medium tracking-wider">Date & Time</th>
                    <th class="p-4 font-medium tracking-wider">Customer / Ref</th>
                    <th class="p-4 font-medium tracking-wider">Items</th>
                    <th class="p-4 font-medium tracking-wider">Total (Rp)</th>
                    <th class="p-4 font-medium tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700/50">
                  <tr v-for="order in filteredOrders" :key="order.id" @click="viewReceipt(order)"
                    class="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group">
                    <td class="p-4">
                      <div class="font-medium text-gray-800 dark:text-gray-200">{{ formatDate(order.createdAt) }}</div>
                    </td>
                    <td class="p-4">
                      <div class="flex items-center gap-3">
                        <div :class="[getAvatarColor(order.customerName || 'Walk-in'), 'w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs']">
                          {{ getInitials(order.customerName || 'W I') }}
                        </div>
                        <div>
                          <div class="font-medium text-gray-800 dark:text-gray-200">{{ order.customerName || 'Walk-in Customer' }}</div>
                          <div class="text-xs text-gray-400 font-mono mt-0.5">#{{ order.id.substring(0, 8) }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="p-4 text-gray-600 dark:text-gray-400">
                      {{ countItems(order.items) }} item(s)
                    </td>
                    <td class="p-4">
                      <div class="font-bold text-gray-800 dark:text-gray-200">{{ fmtMoney(order.total) }}</div>
                    </td>
                    <td class="p-4">
                      <div class="flex flex-col gap-1 items-start">
                        <span :class="getStatusColor(order.status)" class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-transparent">
                          {{ order.status }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredOrders.length === 0">
                    <td colspan="5" class="p-8 text-center text-gray-500 dark:text-gray-400">No orders found.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  <CustomerDetailModal :customerId="detailCustomerId" @close="detailCustomerId = null" />

  <!-- Collect Final Payment dialog (rental return due) -->
  <Teleport to="body">
    <div v-if="collectOrder" class="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div @click="collectOrder = null" class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
      <div class="relative bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">

        <!-- Header -->
        <div class="p-5 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-800">
          <h3 class="font-bold text-rose-800 dark:text-rose-300 text-lg">Collect Final Payment</h3>
          <p class="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Order {{ collectOrder.orderNumber }} · Rental returned</p>
        </div>

        <div class="p-6 space-y-5">
          <!-- Amount summary -->
          <div class="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 space-y-1.5">
            <div class="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Total Order</span><span>{{ fmtMoney(collectOrder.total) }}</span>
            </div>
            <div class="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Deposit Paid</span><span class="text-green-600 dark:text-green-400">{{ fmtMoney(collectOrder.paidAmount) }}</span>
            </div>
            <div class="flex justify-between font-bold text-base text-gray-800 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1">
              <span>Balance Due</span><span class="text-rose-600 dark:text-rose-400">{{ fmtMoney(collectOrder.remainingAmount) }}</span>
            </div>
          </div>

          <!-- Payment method -->
          <div>
            <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Payment Method</p>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="method in ['Cash', 'QRIS', 'Card']" :key="method"
                @click="collectPaymentMethod = method"
                :class="collectPaymentMethod === method ? 'bg-[#004D40] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'"
                class="py-2 rounded-lg text-sm font-bold transition-all">
                {{ method }}
              </button>
            </div>
          </div>

          <!-- QRIS QR hint -->
          <div v-if="collectPaymentMethod === 'QRIS' && qrisQrUrl" class="flex flex-col items-center">
            <img :src="qrisQrUrl" class="w-40 h-40 object-contain rounded-xl border border-gray-200 dark:border-gray-700" alt="QRIS QR" />
            <p class="text-xs text-gray-400 mt-2">Ask customer to scan</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="px-6 pb-6 flex gap-3">
          <button @click="collectOrder = null" class="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm">Cancel</button>
          <button @click="confirmCollectPayment" :disabled="collectingPayment"
            class="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm transition-colors disabled:opacity-50">
            {{ collectingPayment ? 'Processing…' : 'Confirm Payment' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Service completion note dialog -->
  <Teleport to="body">
    <div v-if="confirmingCompleteId" class="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div @click="confirmingCompleteId = null" class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div class="relative bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-gray-100 dark:border-gray-700">
        <h3 class="font-bold text-gray-800 dark:text-white mb-1">Complete Service</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Add an optional note about the work done.</p>
        <textarea v-model="completionNote" rows="3" placeholder="e.g. Replaced filter, cleaned unit, took 2 hours…"
          class="w-full text-sm p-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"></textarea>
        <div class="flex gap-3 mt-4">
          <button @click="confirmingCompleteId = null" class="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm">Cancel</button>
          <button @click="confirmCompleteService" class="flex-1 py-2.5 rounded-xl bg-[#004D40] dark:bg-teal-700 text-white font-bold text-sm hover:bg-[#00695C] transition-colors">Mark Complete</button>
        </div>
      </div>
    </div>
  </Teleport>

  </section>
</template>
