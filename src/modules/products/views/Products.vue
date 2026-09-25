<script setup>
import { ref, computed, onMounted } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useProductsStore } from '../stores/products'
import { useAuthStore } from '../../auth/stores/auth'
import { useToastStore } from '../../../shared/stores/toast'
import { useCurrency } from '../../../shared/composables/useCurrency'
import { db } from '../../../shared/lib/firebaseClient'

const productsStore = useProductsStore()
const authStore = useAuthStore()
const toastStore = useToastStore()
const { fmt: fmtMoney, symbol: currencySymbol } = useCurrency()

// MicroOps is scoped to service + rental products only.
const productTypes = ['Service', 'Rental']

const isViewAllModalOpen = ref(false)

const sortedProducts = computed(() => {
  return [...products.value].sort((a, b) => {
    const getMs = (ts) => ts ? (ts.toMillis ? ts.toMillis() : new Date(ts).getTime()) : 0;
    const timeA = getMs(a.updatedAt) || getMs(a.createdAt) || 0;
    const timeB = getMs(b.updatedAt) || getMs(b.createdAt) || 0;
    return timeB - timeA;
  })
})

const searchQuery = ref('')
const typeFilter = ref('')
const categoryFilter = ref('')

const tableProducts = computed(() => sortedProducts.value.slice(0, 15))

const activeCategoryFilters = computed(() => {
  const used = new Set(productsStore.items.map(p => p.category).filter(Boolean))
  return productCategories.value.filter(c => used.has(c))
})

const filteredProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const t = typeFilter.value
  const c = categoryFilter.value
  let list = sortedProducts.value
  if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q))
  if (t) list = list.filter(p => p.type === t)
  if (c) list = list.filter(p => p.category === c)
  return list
})

const products = computed(() => {
    return productsStore.items.map(item => {
        let typeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        let color = 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'

        switch (item.type) {
            case 'Service':
                typeClass = 'bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-400'
                color = 'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300'
                break
            case 'Rental':
                typeClass = 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                color = 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                break
        }

        const currentStock = item.stock || 0
        const rentalStatus = item.type === 'Rental' ? (item.rentalStatus || 'Available') : null

        return {
            ...item,
            id: item.id,
            typeClass,
            color,
            currentStock,
            rentalStatus,
            initials: item.name ? item.name.substring(0, 2).toUpperCase() : 'P'
        }
    })
})

const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const editId = ref(null)

const addForm = ref({ name: '', sku: '', price: '', type: 'Service', category: 'General', rateUnit: 'hour', maxDuration: '', serviceDuration: '', serviceDurationUnit: 'hour', defaultNotes: '', customStatus: '', stock: '' })
const editForm = ref({ name: '', sku: '', price: '', type: 'Service', category: 'General', rateUnit: 'hour', maxDuration: '', serviceDuration: '', serviceDurationUnit: 'hour', defaultNotes: '', customStatus: '', stock: '' })

const addImageFile = ref(null)
const addImagePreview = ref('')
const editImageFile = ref(null)
const editImagePreview = ref('')
const addImageInput = ref(null)
const editImageInput = ref(null)

const DEFAULT_CATEGORIES = ['General', 'Equipment', 'Cleaning', 'Consulting']
const productCategories = ref([...DEFAULT_CATEGORIES])
const showAddCategoryInput = ref(false)
const showAddCategoryInputEdit = ref(false)
const newCategoryLabel = ref('')

const getCatDocRef = () => {
  const bizId = authStore.user?.businessId
  return bizId ? doc(db, 'businesses', bizId, 'settings', 'products') : null
}

const loadCategories = async () => {
  const ref = getCatDocRef()
  if (!ref) return
  const snap = await getDoc(ref)
  if (snap.exists() && Array.isArray(snap.data().categories)) {
    productCategories.value = snap.data().categories
  }
}

const saveCategories = async () => {
  const ref = getCatDocRef()
  if (!ref) return
  await setDoc(ref, { categories: productCategories.value }, { merge: true })
}

const addCategory = async (formRef) => {
  const label = newCategoryLabel.value.trim()
  if (!label || productCategories.value.includes(label)) return
  productCategories.value.push(label)
  if (formRef) formRef.category = label
  newCategoryLabel.value = ''
  showAddCategoryInput.value = false
  showAddCategoryInputEdit.value = false
  await saveCategories()
}

const deleteCategory = async (idx, formRef) => {
  const removed = productCategories.value[idx]
  productCategories.value.splice(idx, 1)
  if (formRef && formRef.category === removed) {
    formRef.category = productCategories.value[0] || ''
  }
  await saveCategories()
}

onMounted(loadCategories)

const emptyForm = () => ({ name: '', sku: '', price: '', type: productTypes[0], category: 'General', rateUnit: 'hour', maxDuration: '', serviceDuration: '', serviceDurationUnit: 'hour', defaultNotes: '', customStatus: '', stock: '' })

const openAddModal = () => {
    addForm.value = emptyForm()
    addImageFile.value = null
    addImagePreview.value = ''
    isAddModalOpen.value = true
}

const openEditModal = (product) => {
    editId.value = product.id
    editForm.value = {
        name: product.name || '',
        sku: product.sku || '',
        price: product.price || '',
        type: product.type || 'Service',
        category: product.category || 'General',
        rateUnit: product.rateUnit || 'hour',
        maxDuration: product.maxDuration || '',
        serviceDuration: product.serviceDuration || '',
        serviceDurationUnit: product.serviceDurationUnit || 'hour',
        defaultNotes: product.defaultNotes || '',
        customStatus: product.customStatus || '',
        stock: product.stock ?? '',
    }
    editImageFile.value = null
    editImagePreview.value = product.imageUrl || ''
    isEditModalOpen.value = true
}

const closeAddModal = () => {
    isAddModalOpen.value = false
    addForm.value = emptyForm()
    addImageFile.value = null
    addImagePreview.value = ''
}

const closeEditModal = () => {
    isEditModalOpen.value = false
    editId.value = null
    editForm.value = emptyForm()
    editImageFile.value = null
    editImagePreview.value = ''
}

const handleAddImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    addImageFile.value = file
    addImagePreview.value = URL.createObjectURL(file)
}

const handleEditImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    editImageFile.value = file
    editImagePreview.value = URL.createObjectURL(file)
}

const handleAddProduct = async () => {
    if (!addForm.value.name || !addForm.value.type || addForm.value.price === '') return

    const formData = {
        ...addForm.value,
        stock: Number(addForm.value.stock) || 0,
        ...(addForm.value.type === 'Rental' ? { rentalStatus: 'Available' } : {}),
    }
    const imageFile = addImageFile.value
    closeAddModal()

    const tid = toastStore.loading('Adding product...')
    try {
        const docRef = await productsStore.addProduct(formData)
        if (imageFile && docRef) await productsStore.uploadProductImage(docRef.id, imageFile)
        toastStore.replace(tid, 'success', 'Product added successfully')
    } catch (err) {
        console.error('Add product error:', err)
        toastStore.replace(tid, 'error', 'Failed to add product. Please try again.')
    }
}

const handleUpdateProduct = async () => {
    if (!editId.value || !editForm.value.name || !editForm.value.type || editForm.value.price === '') return

    const id = editId.value
    const updates = {
        ...editForm.value,
        price: Number(editForm.value.price) || 0,
        stock: Number(editForm.value.stock) || 0,
    }
    const imageFile = editImageFile.value
    closeEditModal()

    const tid = toastStore.loading('Saving changes...')
    try {
        await productsStore.updateProduct(id, updates)
        if (imageFile) await productsStore.uploadProductImage(id, imageFile)
        toastStore.replace(tid, 'success', 'Product updated successfully')
    } catch (err) {
        console.error('Update product error:', err)
        toastStore.replace(tid, 'error', 'Failed to update product. Please try again.')
    }
}

const handleDelete = async () => {
    if (!editId.value) return
    if (confirm('Are you sure you want to delete this product?')) {
        const id = editId.value
        closeEditModal()
        const tid = toastStore.loading('Deleting product...')
        try {
            await productsStore.deleteProduct(id)
            toastStore.replace(tid, 'success', 'Product deleted')
        } catch (err) {
            console.error('Delete product error:', err)
            toastStore.replace(tid, 'error', 'Failed to delete product. Please try again.')
        }
    }
}
</script>

<template>
  <section class="space-y-12">
    <div>
      <header class="mb-6">
        <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Products Management</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400 mb-4">Manage your services and rental items.</p>

        <button
          @click="openAddModal"
          class="bg-[#004D40] dark:bg-teal-700 text-white font-bold py-2 px-6 rounded-lg shadow hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          Add Item
        </button>
      </header>

      <div class="mb-4 flex justify-between items-center">
        <p class="text-sm text-gray-500 dark:text-gray-400">Showing latest 15 entries.</p>
        <span @click="isViewAllModalOpen = true" class="text-xs font-bold text-[#4DB6AC] dark:text-teal-400 cursor-pointer hover:underline">View All Products</span>
      </div>


      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm overflow-x-auto border border-gray-100 dark:border-gray-700 transition-colors">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-gray-100 dark:border-gray-700">
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Product Info</th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Type</th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Price ({{ currencySymbol }})</th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Availability</th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
            <tr
              v-for="product in tableProducts"
              :key="product.id"
              @click="openEditModal(product)"
              class="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer"
            >

              <td class="p-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg overflow-hidden shadow-sm shrink-0">
                    <img v-if="product.imageUrl" :src="product.imageUrl" class="w-full h-full object-cover" alt="" />
                    <div v-else :class="[product.color, 'w-full h-full flex items-center justify-center font-bold text-xs']">
                      {{ product.initials }}
                    </div>
                  </div>
                  <div>
                    <div class="font-bold text-gray-800 dark:text-white text-sm">{{ product.name }}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs text-gray-400 dark:text-gray-500 font-mono tracking-wide">SKU: {{ product.sku || 'N/A' }}</span>
                        <span v-if="product.category" class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{{ product.category }}</span>
                    </div>
                    <span v-if="product.customStatus" class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      ⚠ {{ product.customStatus }}
                    </span>
                  </div>
                </div>
              </td>

              <td class="p-4">
                <span :class="product.typeClass" class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-transparent">
                  {{ product.type }}
                </span>
              </td>

              <td class="p-4">
                 <div class="font-bold text-gray-800 dark:text-white text-base">{{ fmtMoney(product.price) }}</div>
              </td>

              <td class="p-4">
                 <div class="flex items-center gap-2">
                   <span v-if="product.type === 'Rental'"
                     :class="product.rentalStatus === 'Rented'
                       ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                       : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'"
                     class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                     {{ product.rentalStatus || 'Available' }}
                   </span>
                   <span v-else-if="product.type === 'Service'">
                     <span v-if="product.serviceDuration" class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-400">
                       ~{{ product.serviceDuration }} {{ product.serviceDurationUnit === 'hour' ? 'hr(s)' : 'day(s)' }}
                     </span>
                     <span v-else class="text-sm font-medium text-gray-400 dark:text-gray-500">—</span>
                   </span>
                   <span v-else class="text-sm font-medium text-gray-400 dark:text-gray-500">—</span>
                 </div>
              </td>

              <td class="p-4 text-right">
                  <button
                    @click.stop="openEditModal(product)"
                    class="text-[#004D40] dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-transparent hover:border-teal-200 dark:hover:border-teal-800 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
              </td>
            </tr>
            <tr v-if="tableProducts.length === 0">
                <td colspan="5" class="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No products added yet.
                </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isAddModalOpen" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="closeAddModal" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>
        <div class="relative bg-white dark:bg-gray-800 w-full max-w-3xl rounded-lg shadow-2xl overflow-hidden animate-fade-in-up transition-colors">
            <div class="p-6 border-b border-gray-100 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20 flex justify-between items-center">
                <h3 class="text-xl font-bold text-[#004D40] dark:text-teal-300">Add Item</h3>
                <button @click="closeAddModal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl font-bold leading-none">&times;</button>
            </div>

            <div class="flex flex-col sm:flex-row overflow-y-auto max-h-[80vh] sm:max-h-[75vh]">
                <!-- Form — top on mobile, left on desktop -->
                <div class="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Item Type</label>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="type in productTypes"
                                :key="type"
                                @click="addForm.type = type"
                                :class="addForm.type === type ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                class="px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 focus:outline-none"
                            >
                                {{ type }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                        <div class="flex flex-wrap gap-1.5">
                            <div v-for="(cat, idx) in productCategories" :key="cat" class="relative group/cat">
                                <button type="button"
                                    @click="addForm.category = cat"
                                    :class="addForm.category === cat ? 'bg-indigo-500 text-white pr-6' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-600 pr-6'"
                                    class="pl-3 py-1.5 rounded-lg text-xs font-bold transition-all">{{ cat }}</button>
                                <button type="button"
                                    @click.stop="deleteCategory(idx, addForm)"
                                    class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/cat:opacity-100 transition-opacity text-xs"
                                    :class="addForm.category === cat ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'"
                                >&times;</button>
                            </div>
                            <template v-if="!showAddCategoryInput">
                                <button type="button" @click="showAddCategoryInput = true"
                                    class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">+ Add</button>
                            </template>
                            <template v-else>
                                <div class="flex items-center gap-1">
                                    <input v-model="newCategoryLabel" type="text" placeholder="Category name"
                                        class="w-28 px-2 py-1 text-xs border border-indigo-400 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-400 outline-none"
                                        @keyup.enter="addCategory(addForm)" @keyup.escape="showAddCategoryInput = false; newCategoryLabel = ''" autofocus />
                                    <button type="button" @click="addCategory(addForm)" :disabled="!newCategoryLabel.trim()"
                                        class="px-2 py-1 bg-indigo-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">✓</button>
                                    <button type="button" @click="showAddCategoryInput = false; newCategoryLabel = ''"
                                        class="px-2 py-1 text-gray-400 hover:text-red-500 text-xs font-bold">&times;</button>
                                </div>
                            </template>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Name</label>
                            <input v-model="addForm.name" type="text" placeholder="e.g. Party Tent Rental" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-700 dark:text-white transition-shadow">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Status <span class="text-[10px] font-normal text-gray-400 ml-1">optional</span></label>
                            <input v-model="addForm.customStatus" type="text" placeholder="e.g. Under Repair, On Hold…" class="w-full p-3 bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800/50 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none text-gray-700 dark:text-white transition-shadow text-sm">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">SKU (Optional)</label>
                            <input v-model="addForm.sku" type="text" placeholder="TENT-001" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase text-gray-700 dark:text-white transition-shadow">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{{ addForm.type === 'Rental' ? `Rate (${currencySymbol})` : `Price (${currencySymbol})` }}</label>
                            <input v-model="addForm.price" type="number" placeholder="0.00" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-700 dark:text-white transition-shadow">
                        </div>
                    </div>

                    <div v-if="addForm.type === 'Rental'" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Billing Unit</label>
                                <div class="flex gap-2">
                                    <button @click="addForm.rateUnit = 'hour'" :class="addForm.rateUnit === 'hour' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Hour</button>
                                    <button @click="addForm.rateUnit = 'day'" :class="addForm.rateUnit === 'day' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Day</button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Max Duration ({{ addForm.rateUnit === 'hour' ? 'hrs' : 'days' }})</label>
                                <input v-model="addForm.maxDuration" type="number" min="1" :placeholder="addForm.rateUnit === 'hour' ? 'e.g. 48' : 'e.g. 7'" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Units Available</label>
                            <input v-model="addForm.stock" type="number" min="0" placeholder="0"
                                class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow" />
                        </div>
                    </div>

                    <!-- Service-specific fields -->
                    <template v-if="addForm.type === 'Service'">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Est. Duration</label>
                                <div class="flex gap-2">
                                    <button @click="addForm.serviceDurationUnit = 'hour'"
                                        :class="addForm.serviceDurationUnit === 'hour' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                        class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Hour</button>
                                    <button @click="addForm.serviceDurationUnit = 'day'"
                                        :class="addForm.serviceDurationUnit === 'day' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                        class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Day</button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{{ addForm.serviceDurationUnit === 'hour' ? 'Hours' : 'Days' }} (Optional)</label>
                                <input v-model="addForm.serviceDuration" type="number" min="1" :placeholder="addForm.serviceDurationUnit === 'hour' ? 'e.g. 2' : 'e.g. 1'"
                                    class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-700 dark:text-white transition-shadow" />
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Notes <span class="text-[10px] font-normal text-gray-400 ml-1">pre-fills when booking</span></label>
                            <textarea v-model="addForm.defaultNotes" rows="2" placeholder="e.g. Please prepare the area before technician arrives…"
                                class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-700 dark:text-white resize-none text-sm transition-shadow"></textarea>
                        </div>
                    </template>

                    <div class="pt-2 flex gap-3">
                        <button @click="closeAddModal" class="flex-1 py-3 px-4 rounded-lg text-gray-500 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                        <button @click="handleAddProduct" class="flex-1 py-3 px-4 rounded-lg bg-[#004D40] dark:bg-teal-700 text-white font-bold shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors">Save {{ addForm.type }}</button>
                    </div>
                </div>

                <!-- Image upload — bottom on mobile, right on desktop -->
                <div class="w-full sm:w-64 shrink-0 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 flex flex-col items-center p-4 gap-3">
                    <div class="relative w-full h-52 sm:h-auto sm:aspect-3/4 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700/50 border-2 border-dashed border-gray-200 dark:border-gray-600 group">
                        <img v-if="addImagePreview" :src="addImagePreview" class="absolute inset-0 w-full h-full object-cover" alt="" />
                        <button type="button" @click="addImageInput.click()"
                            class="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                            :class="addImagePreview ? 'bg-black/0 hover:bg-black/25' : 'hover:bg-teal-50 dark:hover:bg-teal-900/20'">
                            <template v-if="!addImagePreview">
                                <svg class="w-10 h-10 text-gray-300 dark:text-gray-500 group-hover:text-teal-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span class="text-xs text-gray-400 dark:text-gray-500 group-hover:text-teal-500 font-medium text-center px-3">Click to upload product image</span>
                            </template>
                            <span v-else class="text-white text-sm font-bold drop-shadow opacity-0 group-hover:opacity-100 transition-opacity">Change</span>
                        </button>
                    </div>
                    <button v-if="addImagePreview" type="button" @click="addImageFile = null; addImagePreview = ''"
                        class="text-xs text-red-400 hover:text-red-600 transition-colors font-medium">Remove image</button>
                    <input ref="addImageInput" type="file" class="hidden" accept="image/*" @change="handleAddImageUpload" />
                </div>
            </div>
        </div>
      </div>

      <div v-if="isEditModalOpen" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div @click="closeEditModal" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>
        <div class="relative bg-white dark:bg-gray-800 w-full max-w-3xl rounded-lg shadow-2xl overflow-hidden animate-fade-in-up transition-colors">
            <div class="p-6 border-b border-gray-100 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20 flex justify-between items-center">
                <h3 class="text-xl font-bold text-[#004D40] dark:text-teal-300">Edit Item</h3>
                <button @click="closeEditModal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl font-bold leading-none">&times;</button>
            </div>

            <div class="flex flex-col sm:flex-row overflow-y-auto max-h-[80vh] sm:max-h-[75vh]">
                <!-- Form — top on mobile, left on desktop -->
                <div class="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Item Type</label>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="type in productTypes"
                                :key="type"
                                @click="editForm.type = type"
                                :class="editForm.type === type ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                class="px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 focus:outline-none"
                            >
                                {{ type }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                        <div class="flex flex-wrap gap-1.5">
                            <div v-for="(cat, idx) in productCategories" :key="cat" class="relative group/cat">
                                <button type="button"
                                    @click="editForm.category = cat"
                                    :class="editForm.category === cat ? 'bg-indigo-500 text-white pr-6' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-600 pr-6'"
                                    class="pl-3 py-1.5 rounded-lg text-xs font-bold transition-all">{{ cat }}</button>
                                <button type="button"
                                    @click.stop="deleteCategory(idx, editForm)"
                                    class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/cat:opacity-100 transition-opacity text-xs"
                                    :class="editForm.category === cat ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'"
                                >&times;</button>
                            </div>
                            <template v-if="!showAddCategoryInputEdit">
                                <button type="button" @click="showAddCategoryInputEdit = true"
                                    class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">+ Add</button>
                            </template>
                            <template v-else>
                                <div class="flex items-center gap-1">
                                    <input v-model="newCategoryLabel" type="text" placeholder="Category name"
                                        class="w-28 px-2 py-1 text-xs border border-indigo-400 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-400 outline-none"
                                        @keyup.enter="addCategory(editForm)" @keyup.escape="showAddCategoryInputEdit = false; newCategoryLabel = ''" autofocus />
                                    <button type="button" @click="addCategory(editForm)" :disabled="!newCategoryLabel.trim()"
                                        class="px-2 py-1 bg-indigo-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">✓</button>
                                    <button type="button" @click="showAddCategoryInputEdit = false; newCategoryLabel = ''"
                                        class="px-2 py-1 text-gray-400 hover:text-red-500 text-xs font-bold">&times;</button>
                                </div>
                            </template>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Name</label>
                            <input v-model="editForm.name" type="text" placeholder="e.g. Party Tent Rental" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Status <span class="text-[10px] font-normal text-gray-400 ml-1">optional</span></label>
                            <input v-model="editForm.customStatus" type="text" placeholder="e.g. Under Repair, On Hold…" class="w-full p-3 bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800/50 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none text-gray-700 dark:text-white transition-shadow text-sm">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">SKU (Optional)</label>
                            <input v-model="editForm.sku" type="text" placeholder="TENT-001" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none uppercase text-gray-700 dark:text-white transition-shadow">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{{ editForm.type === 'Rental' ? `Rate (${currencySymbol})` : `Price (${currencySymbol})` }}</label>
                            <input v-model="editForm.price" type="number" placeholder="0.00" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow">
                        </div>
                    </div>

                    <div v-if="editForm.type === 'Rental'" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Billing Unit</label>
                                <div class="flex gap-2">
                                    <button @click="editForm.rateUnit = 'hour'" :class="editForm.rateUnit === 'hour' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Hour</button>
                                    <button @click="editForm.rateUnit = 'day'" :class="editForm.rateUnit === 'day' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Day</button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Max Duration ({{ editForm.rateUnit === 'hour' ? 'hrs' : 'days' }})</label>
                                <input v-model="editForm.maxDuration" type="number" min="1" :placeholder="editForm.rateUnit === 'hour' ? 'e.g. 48' : 'e.g. 7'" class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Units Available</label>
                            <input v-model="editForm.stock" type="number" min="0" placeholder="0"
                                class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#004D40] outline-none text-gray-700 dark:text-white transition-shadow" />
                        </div>
                    </div>

                    <!-- Service-specific fields -->
                    <template v-if="editForm.type === 'Service'">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Est. Duration</label>
                                <div class="flex gap-2">
                                    <button @click="editForm.serviceDurationUnit = 'hour'"
                                        :class="editForm.serviceDurationUnit === 'hour' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                        class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Hour</button>
                                    <button @click="editForm.serviceDurationUnit = 'day'"
                                        :class="editForm.serviceDurationUnit === 'day' ? 'bg-[#004D40] dark:bg-teal-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                                        class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all focus:outline-none">Per Day</button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{{ editForm.serviceDurationUnit === 'hour' ? 'Hours' : 'Days' }} (Optional)</label>
                                <input v-model="editForm.serviceDuration" type="number" min="1" :placeholder="editForm.serviceDurationUnit === 'hour' ? 'e.g. 2' : 'e.g. 1'"
                                    class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-700 dark:text-white transition-shadow" />
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Notes <span class="text-[10px] font-normal text-gray-400 ml-1">pre-fills when booking</span></label>
                            <textarea v-model="editForm.defaultNotes" rows="2" placeholder="e.g. Please prepare the area before technician arrives…"
                                class="w-full p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-700 dark:text-white resize-none text-sm transition-shadow"></textarea>
                        </div>
                    </template>

                    <div class="pt-2 flex gap-3">
                        <button @click="handleDelete" class="py-3 px-4 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">Delete</button>
                        <button @click="closeEditModal" class="flex-1 py-3 px-4 rounded-lg text-gray-500 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                        <button @click="handleUpdateProduct" class="flex-1 py-3 px-4 rounded-lg bg-[#004D40] dark:bg-teal-700 text-white font-bold shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors">Save {{ editForm.type }}</button>
                    </div>
                </div>

                <!-- Image upload — bottom on mobile, right on desktop -->
                <div class="w-full sm:w-64 shrink-0 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 flex flex-col items-center p-4 gap-3">
                    <div class="relative w-full h-52 sm:h-auto sm:aspect-3/4 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700/50 border-2 border-dashed border-gray-200 dark:border-gray-600 group">
                        <img v-if="editImagePreview" :src="editImagePreview" class="absolute inset-0 w-full h-full object-cover" alt="" />
                        <button type="button" @click="editImageInput.click()"
                            class="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                            :class="editImagePreview ? 'bg-black/0 hover:bg-black/25' : 'hover:bg-teal-50 dark:hover:bg-teal-900/20'">
                            <template v-if="!editImagePreview">
                                <svg class="w-10 h-10 text-gray-300 dark:text-gray-500 group-hover:text-teal-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span class="text-xs text-gray-400 dark:text-gray-500 group-hover:text-teal-500 font-medium text-center px-3">Click to upload product image</span>
                            </template>
                            <span v-else class="text-white text-sm font-bold drop-shadow opacity-0 group-hover:opacity-100 transition-opacity">Change</span>
                        </button>
                    </div>
                    <button v-if="editImagePreview" type="button" @click="editImageFile = null; editImagePreview = ''"
                        class="text-xs text-red-400 hover:text-red-600 transition-colors font-medium">Remove image</button>
                    <input ref="editImageInput" type="file" class="hidden" accept="image/*" @change="handleEditImageUpload" />
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
              <h3 class="text-xl font-bold text-gray-800 dark:text-white">All Products</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Showing all services and rental items.</p>
            </div>
            <button @click="isViewAllModalOpen = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl font-bold leading-none">&times;</button>
          </div>
          <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 space-y-2">
            <!-- Search + Type row -->
            <div class="flex gap-2">
              <div class="relative flex-1">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input v-model="searchQuery" type="text" placeholder="Search by product name…" class="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors" />
              </div>
              <select v-model="typeFilter" class="text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors">
                <option value="">All Types</option>
                <option value="Service">Service</option>
                <option value="Rental">Rental</option>
              </select>
            </div>
            <!-- Category filter chips -->
            <div v-if="activeCategoryFilters.length > 0" class="flex flex-wrap gap-1.5">
              <button @click="categoryFilter = ''"
                :class="categoryFilter === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                class="px-3 py-1 rounded-full text-xs font-bold transition-colors">All Categories</button>
              <button v-for="cat in activeCategoryFilters" :key="cat"
                @click="categoryFilter = categoryFilter === cat ? '' : cat"
                :class="categoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
                class="px-3 py-1 rounded-full text-xs font-bold transition-colors">{{ cat }}</button>
            </div>
          </div>

          <div class="flex-1 overflow-auto p-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 sticky top-0 z-10">
                  <tr class="border-b border-gray-100 dark:border-gray-700">
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">Product Info</th>
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">Type</th>
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">Price ({{ currencySymbol }})</th>
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">Availability</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700 align-top">
                  <tr v-if="filteredProducts.length === 0">
                    <td colspan="4" class="p-8 text-center text-gray-400 dark:text-gray-500">No products found.</td>
                  </tr>
                  <tr v-for="item in filteredProducts" :key="item.id" @click="openEditModal(item)" class="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer">
                    <td class="p-4">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center">
                          <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="w-full h-full object-cover" />
                          <div v-else :class="[item.color, 'w-full h-full flex items-center justify-center font-bold text-xs']">
                            {{ item.initials }}
                          </div>
                        </div>
                        <div>
                          <div class="font-bold text-gray-800 dark:text-white text-sm">{{ item.name }}</div>
                          <div class="flex items-center gap-2 mt-0.5">
                              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono tracking-wide">SKU: {{ item.sku || 'N/A' }}</span>
                              <span v-if="item.category" class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{{ item.category }}</span>
                          </div>
                          <span v-if="item.customStatus" class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            ⚠ {{ item.customStatus }}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td class="p-4">
                      <span :class="item.typeClass" class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-transparent">
                        {{ item.type }}
                      </span>
                    </td>
                    <td class="p-4">
                      <div class="flex items-baseline gap-1">
                          <span class="font-bold text-gray-800 dark:text-white text-base">{{ (item.price || 0).toFixed(2) }}</span>
                          <span v-if="item.type === 'Rental'" class="text-xs text-gray-400 dark:text-gray-500 font-medium">/ {{ item.rateUnit }}</span>
                      </div>
                    </td>
                    <td class="p-4">
                      <div v-if="item.type === 'Service'" class="text-gray-400 dark:text-gray-500 text-sm italic">—</div>
                      <div v-else class="flex flex-col gap-1 items-start">
                         <span v-if="item.type === 'Rental' && item.rentalStatus"
                            :class="item.rentalStatus === 'Available' ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'"
                            class="px-2 py-0.5 text-[10px] font-bold uppercase rounded border border-transparent inline-flex items-center gap-1"
                         >
                            <span class="w-1.5 h-1.5 rounded-full" :class="item.rentalStatus === 'Available' ? 'bg-green-500' : 'bg-amber-500'"></span>
                            {{ item.rentalStatus }}
                         </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  </section>
</template>
