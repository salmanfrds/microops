<script setup>
import { ref, computed, watch } from 'vue'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { useCustomersStore } from '../../modules/customer/stores/customers'
import { useAuthStore } from '../../modules/auth/stores/auth'
import { useToastStore } from '../stores/toast'
import { storage } from '../lib/firebaseClient'

const props = defineProps({
  customerId: { type: String, default: null },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const customersStore = useCustomersStore()
const authStore = useAuthStore()
const toastStore = useToastStore()

const form = ref({ name: '', email: '', phone: '', ic: '' })
const docUploadFile = ref(null)
const docUploadPreview = ref('')
const docInput = ref(null)
const uploadingDoc = ref(false)

const customer = computed(() =>
  customersStore.items.find(c => c.id === props.customerId) || null
)

const currentDocuments = computed(() => customer.value?.documents || [])

watch(() => props.customerId, (id) => {
  if (!id) return
  const c = customersStore.items.find(x => x.id === id)
  if (!c) return
  form.value = { name: c.name || '', email: c.email || '', phone: c.phone || '', ic: c.ic || '' }
  docUploadFile.value = null
  docUploadPreview.value = ''
}, { immediate: true })

const close = () => emit('close')

// --- EDIT ---
const handleUpdate = async () => {
  if (!props.customerId || !form.value.name || !form.value.email) return
  const tid = toastStore.loading('Saving changes...')
  try {
    await customersStore.updateCustomer(props.customerId, form.value)
    toastStore.replace(tid, 'success', 'Customer updated')
    close()
  } catch {
    toastStore.replace(tid, 'error', 'Failed to save changes.')
  }
}

const handleDelete = async () => {
  if (!props.customerId) return
  if (!confirm('Are you sure you want to delete this customer?')) return
  const tid = toastStore.loading('Deleting customer...')
  try {
    await customersStore.deleteCustomer(props.customerId)
    toastStore.replace(tid, 'success', 'Customer deleted')
    close()
  } catch {
    toastStore.replace(tid, 'error', 'Failed to delete customer.')
  }
}

// --- DOCUMENTS ---
const handleDocFileSelect = (e) => {
  const file = e.target.files[0]
  if (!file) return
  docUploadFile.value = file
  docUploadPreview.value = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
}

const handleDocUpload = async () => {
  if (!docUploadFile.value || !props.customerId || uploadingDoc.value) return
  const bizId = authStore.user?.businessId
  if (!bizId) return
  uploadingDoc.value = true
  const tid = toastStore.loading('Uploading document...')
  try {
    const file = docUploadFile.value
    const path = `business/${bizId}/customers/${props.customerId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const ref = storageRef(storage, path)
    await uploadBytes(ref, file, { contentType: file.type })
    const url = await getDownloadURL(ref)
    await customersStore.addDocument(props.customerId, {
      name: file.name, url, path, type: file.type, uploadedAt: new Date().toISOString()
    })
    docUploadFile.value = null
    docUploadPreview.value = ''
    if (docInput.value) docInput.value.value = ''
    toastStore.replace(tid, 'success', 'Document uploaded')
  } catch (err) {
    console.error(err)
    toastStore.replace(tid, 'error', 'Upload failed. Please try again.')
  } finally {
    uploadingDoc.value = false
  }
}

const handleDocDelete = async (docEntry) => {
  if (!props.customerId) return
  const tid = toastStore.loading('Removing document...')
  try {
    try { await deleteObject(storageRef(storage, docEntry.path)) } catch { /* already gone */ }
    await customersStore.removeDocument(props.customerId, docEntry)
    toastStore.replace(tid, 'success', 'Document removed')
  } catch {
    toastStore.replace(tid, 'error', 'Failed to remove document.')
  }
}

const isImage = (type) => type?.startsWith('image/')
const docIcon = (type) => {
  if (isImage(type)) return null
  if (type === 'application/pdf') return 'PDF'
  return 'DOC'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="customerId" class="fixed inset-0 z-60 flex items-center justify-center p-4" :class="{ 'compact-text': compact }">
      <div @click="close" class="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"></div>

      <div class="relative bg-white dark:bg-gray-800 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden animate-fade-in-up transition-colors">

        <!-- Header -->
        <div class="p-6 border-b border-gray-100 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20 flex justify-between items-center">
          <div>
            <h3 class="text-xl font-bold text-[#004D40] dark:text-teal-300">Customer Profile</h3>
            <p class="text-xs text-teal-700 dark:text-teal-400 mt-1">Edit details and manage documents.</p>
          </div>
          <button @click="close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl font-bold leading-none">&times;</button>
        </div>

        <div class="flex" style="max-height:75vh">

          <!-- LEFT: form -->
          <div class="flex-1 p-6 space-y-4 overflow-y-auto border-r border-gray-100 dark:border-gray-700">
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Full Name</label>
              <input v-model="form.name" type="text" class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-800 dark:text-white">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Email Address</label>
              <input v-model="form.email" type="email" class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-800 dark:text-white">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Phone (Optional)</label>
              <input v-model="form.phone" type="tel" class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-800 dark:text-white">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">IC Number (Optional)</label>
              <input v-model="form.ic" type="text" placeholder="e.g. 900101-14-1234" class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-[#4DB6AC] outline-none text-gray-800 dark:text-white font-mono">
            </div>

            <div class="pt-2 flex gap-2">
              <button @click="handleDelete" class="py-3 px-4 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">Delete</button>
              <button @click="close" class="flex-1 py-3 px-4 rounded-lg text-gray-500 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button @click="handleUpdate" class="flex-1 py-3 px-4 rounded-lg bg-[#004D40] dark:bg-teal-700 text-white font-bold shadow-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-all">Save</button>
            </div>
          </div>

          <!-- RIGHT: documents -->
          <div class="w-56 shrink-0 flex flex-col bg-gray-50 dark:bg-gray-900/30">
            <div class="px-4 pt-4 pb-2 shrink-0 border-b border-gray-100 dark:border-gray-700">
              <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documents</p>
              <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">IC, passport, agreements</p>
            </div>

            <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
              <div v-if="currentDocuments.length === 0" class="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">No documents yet.</div>
              <div v-for="(d, idx) in currentDocuments" :key="idx"
                class="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-100 dark:border-gray-700 group">
                <div class="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <img v-if="isImage(d.type)" :src="d.url" class="w-full h-full object-cover" alt="" />
                  <span v-else class="text-[10px] font-black text-gray-500 dark:text-gray-400">{{ docIcon(d.type) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate" :title="d.name">{{ d.name }}</p>
                  <a :href="d.url" target="_blank" class="text-[9px] text-teal-600 dark:text-teal-400 hover:underline">View / Download</a>
                </div>
                <button @click="handleDocDelete(d)"
                  class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 p-0.5">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div class="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700 shrink-0 space-y-2">
              <div @click="docInput.click()"
                class="border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-3 flex flex-col items-center gap-1 cursor-pointer hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors">
                <template v-if="!docUploadFile">
                  <svg class="w-6 h-6 text-gray-300 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="text-[10px] text-gray-400 dark:text-gray-500 text-center">Click to add image or PDF</span>
                </template>
                <template v-else>
                  <img v-if="docUploadPreview" :src="docUploadPreview" class="w-full h-16 object-cover rounded" alt="" />
                  <div v-else class="w-full h-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400">{{ docUploadFile.name.split('.').pop().toUpperCase() }}</span>
                  </div>
                  <span class="text-[9px] text-gray-400 truncate w-full text-center" :title="docUploadFile.name">{{ docUploadFile.name }}</span>
                </template>
              </div>
              <button v-if="docUploadFile" @click="handleDocUpload" :disabled="uploadingDoc"
                class="w-full py-1.5 bg-[#004D40] dark:bg-teal-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors">
                {{ uploadingDoc ? 'Uploading…' : 'Upload' }}
              </button>
              <input ref="docInput" type="file" class="hidden" accept="image/*,.pdf,.doc,.docx" @change="handleDocFileSelect" />
            </div>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>
