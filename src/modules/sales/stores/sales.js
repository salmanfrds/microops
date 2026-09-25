import { defineStore } from 'pinia'
import { computed } from 'vue'
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '../../../shared/lib/firebaseClient'
import { useAuthStore } from '../../auth/stores/auth'

export const useSalesStore = defineStore('sales', () => {
    const authStore = useAuthStore()

    const ordersRef = computed(() => {
        const bizId = authStore.user?.businessId
        return bizId ? collection(db, `businesses/${bizId}/orders`) : null
    })
    const orders = useCollection(ordersRef)

    const getBizId = () => {
        const bizId = authStore.user?.businessId
        if (!bizId) throw new Error('No active business session')
        return bizId
    }

    const createOrder = async ({ customerName, customerId, items, paymentMethod, partialPayment, serviceNotes, discount, subtotalRaw, lineDiscountsTotal }) => {
        const bizId = getBizId()
        const subtotal = items.reduce((acc, i) => acc + (i.subtotal != null ? i.subtotal : i.price * i.qty), 0)
        const discountAmount = discount?.amount || 0
        const total = Math.max(0, subtotal - discountAmount)
        const orderNumber = `#${Date.now().toString().slice(-5)}`
        const hasRentals = items.some(i => i.isRental)
        const hasServices = items.some(i => i.isService)
        const nowMs = Date.now()

        const isPartial = partialPayment?.enabled && partialPayment.paidAmount > 0
        const paidAmount = isPartial ? partialPayment.paidAmount : total
        const remainingAmount = isPartial ? total - partialPayment.paidAmount : 0

        const processedItems = items.map(item => {
            if (item.isRental) {
                const msPerUnit = { hour: 3600000, day: 86400000, month: 30 * 86400000 }
                const durationMs = item.duration * (msPerUnit[item.rateUnit] || 3600000)
                return {
                    ...item,
                    rentalStartAt: Timestamp.fromMillis(nowMs),
                    rentalEndAt: Timestamp.fromMillis(nowMs + durationMs)
                }
            }
            return item
        })

        await addDoc(collection(db, `businesses/${bizId}/orders`), {
            orderNumber,
            customerName: customerName || 'Walk-in Customer',
            customerId: customerId || null,
            items: processedItems,
            subtotal: subtotalRaw ?? subtotal,
            lineDiscountsTotal: lineDiscountsTotal || 0,
            discountId: discount?.id || null,
            discountName: discount?.name || null,
            discountType: discount?.type || null,
            discountValue: discount?.value || null,
            discountAmount: discountAmount || null,
            total,
            paidAmount,
            remainingAmount,
            status: hasRentals ? 'Active' : hasServices ? 'Scheduled' : 'Completed',
            hasRentals,
            hasServices,
            serviceNotes: serviceNotes || null,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: isPartial ? 'Partial' : 'Paid',
            partialPercent: isPartial ? partialPayment.percent : null,
            createdAt: serverTimestamp()
        })

        for (const item of items) {
            if (item.isRental && item.productId) {
                await updateDoc(doc(db, `businesses/${bizId}/products`, item.productId), { rentalStatus: 'Rented' })
            }
        }
    }

    // Called when rental countdown expires. Partial rentals go to 'Return Due'; full pay go straight to 'Completed'.
    const completeRentalOrder = async (orderId, items, isPartial = false) => {
        const bizId = getBizId()
        await updateDoc(doc(db, `businesses/${bizId}/orders`, orderId), {
            status: isPartial ? 'Return Due' : 'Completed',
            ...(isPartial ? {} : { completedAt: serverTimestamp() }),
        })
        // Item is physically back — mark available regardless of payment status
        for (const item of items) {
            if (item.isRental && item.productId) {
                await updateDoc(doc(db, `businesses/${bizId}/products`, item.productId), { rentalStatus: 'Available' })
            }
        }
    }

    const collectFinalPayment = async (orderId, paymentMethod) => {
        const bizId = getBizId()
        await updateDoc(doc(db, `businesses/${bizId}/orders`, orderId), {
            status: 'Completed',
            paymentStatus: 'Paid',
            remainingAmount: 0,
            partialPercent: null,
            finalPaymentMethod: paymentMethod || 'Cash',
            completedAt: serverTimestamp(),
        })
    }

    const advanceServiceOrder = async (orderId, currentStatus) => {
        const bizId = getBizId()
        const next = currentStatus === 'Scheduled' ? 'In Progress' : 'Completed'
        await updateDoc(doc(db, `businesses/${bizId}/orders`, orderId), {
            status: next,
            ...(next === 'Completed' ? { completedAt: serverTimestamp() } : {}),
            updatedAt: serverTimestamp()
        })
    }

    const completeServiceOrder = async (orderId, completionNote) => {
        const bizId = getBizId()
        await updateDoc(doc(db, `businesses/${bizId}/orders`, orderId), {
            status: 'Completed',
            completionNote: completionNote || null,
            completedAt: serverTimestamp()
        })
    }

    const settleBalance = async (orderId) => {
        const bizId = getBizId()
        const orderDoc = doc(db, `businesses/${bizId}/orders`, orderId)
        await updateDoc(orderDoc, {
            paymentStatus: 'Paid',
            remainingAmount: 0,
            partialPercent: null,
            settledAt: serverTimestamp()
        })
    }

    const updateOrderStatus = async (orderId, status) => {
        const bizId = getBizId()
        const orderDoc = doc(db, `businesses/${bizId}/orders`, orderId)
        await updateDoc(orderDoc, { status, updatedAt: serverTimestamp() })
    }

    return { orders, createOrder, completeRentalOrder, collectFinalPayment, advanceServiceOrder, completeServiceOrder, updateOrderStatus, settleBalance }
})
