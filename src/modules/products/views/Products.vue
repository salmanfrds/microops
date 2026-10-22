<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProductsStore } from '../stores/products'
import { useCurrency } from '../../../shared/composables/useCurrency'

const router = useRouter()
const productsStore = useProductsStore()
const { fmt: fmtMoney, symbol: currencySymbol } = useCurrency()

const isViewAllModalOpen = ref(false)

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

const sortedProducts = computed(() => {
  return [...products.value].sort((a, b) => {
    const getMs = (ts) => ts ? (ts.toMillis ? ts.toMillis() : new Date(ts).getTime()) : 0;
    const timeA = getMs(a.updatedAt) || getMs(a.createdAt) || 0;
    const timeB = getMs(b.updatedAt) || getMs(b.createdAt) || 0;
    return timeB - timeA;
  })
})

const tableProducts = computed(() => sortedProducts.value.slice(0, 15))

// Add / edit now live on their own full screens instead of dialogs.
const goToAdd = () => router.push('/products/new')
const goToEdit = (product) => {
    if (product?.id) router.push(`/products/${product.id}/edit`)
}
</script>

<template>
  <section class="space-y-8 compact-text">
    <div>
      <header class="mb-6">
        <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Products Management</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400 mb-4">Manage your services and rental items.</p>

        <button
          @click="goToAdd"
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


      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-x-auto border border-gray-100 dark:border-gray-700 transition-colors">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-gray-100 dark:border-gray-700">
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span class="lg:hidden">Product</span>
                <span class="hidden lg:inline">Product Info</span>
              </th>
              <th class="hidden lg:table-cell p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Type</th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span class="lg:hidden">Price</span>
                <span class="hidden lg:inline">Price ({{ currencySymbol }})</span>
              </th>
              <th class="p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Availability</th>
              <th class="hidden lg:table-cell p-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
            <tr
              v-for="product in tableProducts"
              :key="product.id"
              @click="goToEdit(product)"
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
                    <div class="hidden lg:flex items-center gap-2 mt-0.5">
                        <span class="text-xs text-gray-400 dark:text-gray-500 font-mono tracking-wide">SKU: {{ product.sku || 'N/A' }}</span>
                        <span v-if="product.category" class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{{ product.category }}</span>
                    </div>
                    <span v-if="product.customStatus" class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      ⚠ {{ product.customStatus }}
                    </span>
                  </div>
                </div>
              </td>

              <td class="hidden lg:table-cell p-4">
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

              <td class="hidden lg:table-cell p-4 text-right">
                  <button
                    @click.stop="goToEdit(product)"
                    class="text-[#004D40] dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-transparent hover:border-teal-200 dark:hover:border-teal-800 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
              </td>
            </tr>
            <tr v-if="tableProducts.length === 0">
                <td colspan="3" class="p-8 text-center text-gray-500 dark:text-gray-400 text-sm lg:hidden">
                    No products added yet.
                </td>
                <td colspan="5" class="hidden lg:table-cell p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No products added yet.
                </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>


    <!-- VIEW ALL MODAL -->
    <Teleport to="body">
      <div v-if="isViewAllModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 compact-text">
        <div @click="isViewAllModalOpen = false" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>
        <div class="relative bg-gray-50 dark:bg-gray-900 w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col animate-fade-in-up overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center shrink-0">
            <div>
              <h3 class="text-xl font-bold text-gray-800 dark:text-white">All Products</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Showing all services and rental items.</p>
            </div>
            <button @click="isViewAllModalOpen = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl font-bold leading-none">&times;</button>
          </div>
          <div class="flex-1 overflow-auto">
            <div class="bg-white dark:bg-gray-800 overflow-hidden">
              <table class="w-full text-left border-collapse lg:whitespace-nowrap">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 sticky top-0 z-10">
                  <tr class="border-b border-gray-100 dark:border-gray-700">
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">
                      <span class="lg:hidden">Product</span>
                      <span class="hidden lg:inline">Product Info</span>
                    </th>
                    <th class="hidden lg:table-cell p-4 text-xs font-bold uppercase tracking-wider">Type</th>
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">
                      <span class="lg:hidden">Price</span>
                      <span class="hidden lg:inline">Price ({{ currencySymbol }})</span>
                    </th>
                    <th class="p-4 text-xs font-bold uppercase tracking-wider">Availability</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700 align-top">
                  <tr v-if="sortedProducts.length === 0">
                    <td colspan="3" class="p-8 text-center text-gray-400 dark:text-gray-500 lg:hidden">No products found.</td>
                    <td colspan="4" class="hidden lg:table-cell p-8 text-center text-gray-400 dark:text-gray-500">No products found.</td>
                  </tr>
                  <tr v-for="item in sortedProducts" :key="item.id" @click="goToEdit(item)" class="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer">
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
                          <div class="hidden lg:flex items-center gap-2 mt-0.5">
                              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono tracking-wide">SKU: {{ item.sku || 'N/A' }}</span>
                              <span v-if="item.category" class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{{ item.category }}</span>
                          </div>
                          <span v-if="item.customStatus" class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            ⚠ {{ item.customStatus }}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td class="hidden lg:table-cell p-4">
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
