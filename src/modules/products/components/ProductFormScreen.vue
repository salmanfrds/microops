<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProductsStore } from '../stores/products'
import { useToastStore } from '../../../shared/stores/toast'
import { useCurrency } from '../../../shared/composables/useCurrency'
import { useProductCategories } from '../composables/useProductCategories'

const props = defineProps({
  mode: { type: String, default: 'add' }, // 'add' | 'edit'
  productId: { type: String, default: '' },
})

const router = useRouter()
const productsStore = useProductsStore()
const toastStore = useToastStore()
const { symbol: currencySymbol } = useCurrency()
const { categories, loadCategories, addCategory, removeCategory } = useProductCategories()

const productTypes = ['Service', 'Rental']

const emptyForm = () => ({
  name: '',
  sku: '',
  price: '',
  type: 'Service',
  category: 'General',
  rateUnit: 'hour',
  maxDuration: '',
  serviceDuration: '',
  serviceDurationUnit: 'hour',
  defaultNotes: '',
  customStatus: '',
  stock: '',
})

const form = ref(emptyForm())
const imageFile = ref(null)
const imagePreview = ref('')
const existingImageUrl = ref('')
const imageInput = ref(null)
const saving = ref(false)
const showNewCategory = ref(false)
const newCategoryLabel = ref('')
const hydrated = ref(false)

const inputClass =
  'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 outline-none transition focus:border-[#004D40] focus:ring-2 focus:ring-[#004D40]/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-teal-500 dark:focus:ring-teal-500/25'

const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400'

const isEdit = computed(() => props.mode === 'edit')
const title = computed(() => (isEdit.value ? 'Edit item' : 'New item'))
const saveLabel = computed(() => (isEdit.value ? 'Save changes' : 'Save item'))
const priceLabel = computed(() =>
  form.value.type === 'Rental' ? `Rate (${currencySymbol.value})` : `Price (${currencySymbol.value})`
)
const canSave = computed(
  () => form.value.name.trim().length > 0 && String(form.value.price).length > 0 && !saving.value
)

const existingProduct = computed(() =>
  isEdit.value ? productsStore.items.find((item) => item.id === props.productId) : null
)

watch(
  existingProduct,
  (product) => {
    if (!product || hydrated.value) return
    form.value = {
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ?? '',
      type: product.type === 'Rental' ? 'Rental' : 'Service',
      category: product.category || 'General',
      rateUnit: product.rateUnit || 'hour',
      maxDuration: product.maxDuration ?? '',
      serviceDuration: product.serviceDuration ?? '',
      serviceDurationUnit: product.serviceDurationUnit || 'hour',
      defaultNotes: product.defaultNotes || '',
      customStatus: product.customStatus || '',
      stock: product.stock ?? '',
    }
    existingImageUrl.value = product.imageUrl || ''
    imagePreview.value = product.imageUrl || ''
    hydrated.value = true
  },
  { immediate: true }
)

onMounted(loadCategories)

const handleImageUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (imagePreview.value && imagePreview.value.startsWith('blob:')) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
  event.target.value = ''
}

const removeImage = () => {
  if (imagePreview.value.startsWith('blob:')) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = null
  imagePreview.value = ''
}

const handleAddCategory = async () => {
  const name = await addCategory(newCategoryLabel.value)
  if (name) form.value.category = name
  newCategoryLabel.value = ''
  showNewCategory.value = false
}

const handleRemoveCategory = async (name) => {
  await removeCategory(name)
  if (form.value.category === name) form.value.category = categories.value[0] || 'General'
}

const closeScreen = () => {
  if (window.history.state?.back) router.back()
  else router.replace('/products')
}

const handleSave = async () => {
  if (!form.value.name.trim()) {
    toastStore.error('Give the item a name first')
    return
  }
  if (String(form.value.price).length === 0) {
    toastStore.error(`Set a ${form.value.type === 'Rental' ? 'rate' : 'price'} first`)
    return
  }

  saving.value = true
  const tid = toastStore.loading(isEdit.value ? 'Saving changes…' : 'Saving item…')

  try {
    const payload = {
      ...form.value,
      name: form.value.name.trim(),
      price: Number(form.value.price) || 0,
      stock: Number(form.value.stock) || 0,
    }

    if (isEdit.value) {
      await productsStore.updateProduct(props.productId, {
        ...payload,
        imageUrl: imagePreview.value ? existingImageUrl.value : '',
      })
      if (imageFile.value) await productsStore.uploadProductImage(props.productId, imageFile.value)
      toastStore.replace(tid, 'success', 'Item updated')
    } else {
      if (form.value.type === 'Rental') payload.rentalStatus = 'Available'
      const docRef = await productsStore.addProduct(payload)
      if (imageFile.value && docRef) await productsStore.uploadProductImage(docRef.id, imageFile.value)
      toastStore.replace(tid, 'success', 'Item added')
    }

    router.replace('/products')
  } catch (err) {
    console.error('Save product error:', err)
    toastStore.replace(tid, 'error', 'Could not save the item. Please try again.')
  } finally {
    saving.value = false
  }
}

const handleDelete = async () => {
  if (!confirm('Delete this item? This cannot be undone.')) return
  saving.value = true
  const tid = toastStore.loading('Deleting item…')
  try {
    await productsStore.deleteProduct(props.productId)
    toastStore.replace(tid, 'success', 'Item deleted')
    router.replace('/products')
  } catch (err) {
    console.error('Delete product error:', err)
    toastStore.replace(tid, 'error', 'Could not delete the item. Please try again.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="relative flex h-full flex-col bg-[#F8F7F4] text-gray-800 dark:bg-gray-900 dark:text-gray-100">
    <!-- Image and fields scroll together; only the CTA stays pinned -->
    <div class="flex-1 overflow-y-auto overscroll-contain">
      <div class="relative h-60 w-full overflow-hidden bg-gray-200 dark:bg-gray-800 sm:h-72">
        <img v-if="imagePreview" :src="imagePreview" alt="" class="absolute inset-0 h-full w-full object-cover" />
        <div
          v-else
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-teal-50 via-white to-gray-100 dark:from-teal-900/30 dark:via-gray-900 dark:to-gray-800"
        >
          <svg class="h-10 w-10 text-[#004D40]/40 dark:text-teal-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-sm font-bold text-gray-500 dark:text-gray-400">Add a product photo</p>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">Tap anywhere in this area</p>
        </div>

        <!-- Tap target for picking an image -->
        <button
          type="button"
          class="absolute inset-0 z-10 flex items-end justify-center pb-4"
          :aria-label="imagePreview ? 'Change product photo' : 'Upload product photo'"
          @click="imageInput.click()"
        >
          <span
            v-if="imagePreview"
            class="rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-black/70"
          >
            Change photo
          </span>
        </button>

        <button
          v-if="imagePreview"
          type="button"
          class="absolute bottom-4 right-4 z-20 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-red-600 shadow-md backdrop-blur dark:bg-gray-900/85 dark:text-red-400"
          @click="removeImage"
        >
          Remove
        </button>

        <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
      </div>

      <div class="px-4 pb-8 pt-5 sm:px-6">
        <div class="mx-auto w-full max-w-2xl space-y-6">
          <div>
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">{{ title }}</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ isEdit ? 'Update the details of this service or rental.' : 'Add a service or rental item to your catalog.' }}
            </p>
          </div>

          <section>
            <span :class="labelClass">Item type</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="type in productTypes"
                :key="type"
                type="button"
                :class="
                  form.type === type
                    ? 'bg-[#004D40] text-white shadow-md dark:bg-teal-700'
                    : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                "
                class="rounded-2xl py-3.5 text-sm font-bold transition active:scale-[0.99]"
                @click="form.type = type"
              >
                {{ type }}
              </button>
            </div>
          </section>

          <section>
            <span :class="labelClass">Category</span>
            <div class="flex flex-wrap gap-2">
              <div v-for="cat in categories" :key="cat" class="relative">
                <button
                  type="button"
                  :class="
                    form.category === cat
                      ? 'bg-indigo-500 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  "
                  class="rounded-full py-2 pl-3.5 pr-8 text-xs font-bold transition"
                  @click="form.category = cat"
                >
                  {{ cat }}
                </button>
                <button
                  type="button"
                  aria-label="Delete category"
                  :class="form.category === cat ? 'text-white/70' : 'text-gray-400'"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold leading-none"
                  @click="handleRemoveCategory(cat)"
                >
                  &times;
                </button>
              </div>

              <button
                v-if="!showNewCategory"
                type="button"
                class="rounded-full border border-dashed border-gray-300 px-3.5 py-2 text-xs font-bold text-gray-400 dark:border-gray-600 dark:text-gray-500"
                @click="showNewCategory = true"
              >
                + Add
              </button>
              <div v-else class="flex items-center gap-1.5">
                <input
                  v-model="newCategoryLabel"
                  type="text"
                  placeholder="Category name"
                  class="w-36 rounded-full border border-indigo-400 bg-white px-3 py-2 text-sm text-gray-800 outline-none dark:bg-gray-800 dark:text-white"
                  @keyup.enter="handleAddCategory"
                  @keyup.escape="showNewCategory = false; newCategoryLabel = ''"
                  autofocus
                />
                <button
                  type="button"
                  :disabled="!newCategoryLabel.trim()"
                  class="rounded-full bg-indigo-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  @click="handleAddCategory"
                >
                  Add
                </button>
                <button
                  type="button"
                  class="px-1 text-sm font-bold text-gray-400"
                  @click="showNewCategory = false; newCategoryLabel = ''"
                >
                  &times;
                </button>
              </div>
            </div>
          </section>

          <div>
            <label :class="labelClass" for="product-name">Name</label>
            <input
              id="product-name"
              v-model="form.name"
              type="text"
              placeholder="e.g. Party Tent Rental"
              :class="inputClass"
            />
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label :class="labelClass" for="product-price">{{ priceLabel }}</label>
              <input
                id="product-price"
                v-model="form.price"
                type="number"
                inputmode="decimal"
                placeholder="0.00"
                :class="inputClass"
              />
            </div>
            <div>
              <label :class="labelClass" for="product-sku">SKU <span class="font-normal normal-case">(optional)</span></label>
              <input
                id="product-sku"
                v-model="form.sku"
                type="text"
                placeholder="TENT-001"
                :class="[inputClass, 'uppercase']"
              />
            </div>
          </div>

          <div>
            <label :class="labelClass" for="product-status">Status <span class="font-normal normal-case">(optional)</span></label>
            <input
              id="product-status"
              v-model="form.customStatus"
              type="text"
              placeholder="e.g. Under Repair, On Hold…"
              :class="[inputClass, 'border-amber-200 dark:border-amber-800/60']"
            />
          </div>

          <!-- Rental specific -->
          <section v-if="form.type === 'Rental'" class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
            <div>
              <span :class="labelClass">Billing unit</span>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="unit in ['hour', 'day']"
                  :key="unit"
                  type="button"
                  :class="
                    form.rateUnit === unit
                      ? 'bg-[#004D40] text-white shadow-md dark:bg-teal-700'
                      : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  "
                  class="rounded-2xl py-3.5 text-sm font-bold transition active:scale-[0.99]"
                  @click="form.rateUnit = unit"
                >
                  Per {{ unit }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label :class="labelClass" for="product-max-duration">
                  Max duration ({{ form.rateUnit === 'hour' ? 'hrs' : 'days' }})
                </label>
                <input
                  id="product-max-duration"
                  v-model="form.maxDuration"
                  type="number"
                  min="1"
                  :placeholder="form.rateUnit === 'hour' ? 'e.g. 48' : 'e.g. 7'"
                  :class="inputClass"
                />
              </div>
              <div>
                <label :class="labelClass" for="product-stock">Units available</label>
                <input
                  id="product-stock"
                  v-model="form.stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  :class="inputClass"
                />
              </div>
            </div>
          </section>

          <!-- Service specific -->
          <section v-else class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
            <div>
              <span :class="labelClass">Estimated duration</span>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="unit in ['hour', 'day']"
                  :key="unit"
                  type="button"
                  :class="
                    form.serviceDurationUnit === unit
                      ? 'bg-[#004D40] text-white shadow-md dark:bg-teal-700'
                      : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  "
                  class="rounded-2xl py-3.5 text-sm font-bold transition active:scale-[0.99]"
                  @click="form.serviceDurationUnit = unit"
                >
                  Per {{ unit }}
                </button>
              </div>
            </div>

            <div>
              <label :class="labelClass" for="product-duration">
                {{ form.serviceDurationUnit === 'hour' ? 'Hours' : 'Days' }}
                <span class="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="product-duration"
                v-model="form.serviceDuration"
                type="number"
                min="1"
                :placeholder="form.serviceDurationUnit === 'hour' ? 'e.g. 2' : 'e.g. 1'"
                :class="inputClass"
              />
            </div>

            <div>
              <label :class="labelClass" for="product-notes">
                Default notes <span class="font-normal normal-case">(pre-fills when booking)</span>
              </label>
              <textarea
                id="product-notes"
                v-model="form.defaultNotes"
                rows="3"
                placeholder="e.g. Please prepare the area before the technician arrives…"
                :class="[inputClass, 'resize-none']"
              ></textarea>
            </div>
          </section>

          <section v-if="isEdit" class="border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              :disabled="saving"
              class="w-full rounded-2xl border border-red-200 bg-red-50 py-3.5 text-sm font-bold text-red-600 transition active:scale-[0.99] disabled:opacity-40 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
              @click="handleDelete"
            >
              Delete this item
            </button>
          </section>
        </div>
      </div>
    </div>

    <!-- Cancel / exit — floats above the scrolling content -->
    <button
      type="button"
      aria-label="Cancel and go back"
      class="absolute right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md transition active:scale-95 hover:bg-black/60"
      style="top: calc(env(safe-area-inset-top) + 1rem)"
      @click="closeScreen"
    >
      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- The only CTA on the screen -->
    <div
      class="shrink-0 border-t border-gray-200/80 bg-white/95 px-4 pt-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.75rem)"
    >
      <button
        type="button"
        :disabled="!canSave"
        class="w-full rounded-2xl bg-[#004D40] py-4 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-teal-700"
        @click="handleSave"
      >
        {{ saving ? 'Saving…' : saveLabel }}
      </button>
    </div>
  </div>
</template>
