<script setup>
import { ref, onMounted } from 'vue'
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../shared/lib/firebaseClient'
import { useAuthStore } from '../../auth/stores/auth'
import { useToastStore } from '../../../shared/stores/toast'

const authStore = useAuthStore()
const toastStore = useToastStore()

const business = ref({
  name: '', address: '', phone: '', website: '',
  bankName: '', accountNumber: '', accountName: '', qrisId: '',
  logoUrl: '', qrisQrUrl: ''
})

const savedName = ref('')



const logoPreview = ref('')
const qrPreview = ref('')
const logoUploading = ref(false)
const qrUploading = ref(false)
const saving = ref(false)

// --- STAFF ---
const staff = ref([])
const roles = ['Owner', 'Manager', 'Cashier']
const isAddStaffModalOpen = ref(false)
const newStaff = ref({ full_name: '', role: 'Cashier', pin: '' })

const logoInput = ref(null)
const qrInput = ref(null)

const getBizId = () => authStore.user?.businessId

// --- LOAD BUSINESS PROFILE ---
const loadProfile = async () => {
  const uid = getBizId()
  if (!uid) return
  try {
    const snap = await getDoc(doc(db, 'businesses', uid))
    if (snap.exists()) {
      const data = snap.data()
      business.value = {
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        website: data.website || '',
        bankName: data.bankName || '',
        accountNumber: data.accountNumber || '',
        accountName: data.accountName || '',
        qrisId: data.qrisId || data.duitnowId || '',
        logoUrl: data.logoUrl || '',
        qrisQrUrl: data.qrisQrUrl || data.duitnowQrUrl || ''
      }
      logoPreview.value = data.logoUrl || ''
      qrPreview.value = data.qrisQrUrl || data.duitnowQrUrl || ''
      savedName.value = data.name || ''
    }
  } catch (err) {
    console.error('Error loading business profile:', err)
  }
}

// --- SAVE BUSINESS PROFILE ---
const saveProfile = async () => {
  const uid = getBizId()
  if (!uid || saving.value) return
  saving.value = true
  const tid = toastStore.loading('Saving business details...')
  let success = false
  try {
    await setDoc(doc(db, 'businesses', uid), {
      name: business.value.name,
      address: business.value.address,
      phone: business.value.phone,
      website: business.value.website,
      bankName: business.value.bankName,
      accountNumber: business.value.accountNumber,
      accountName: business.value.accountName,
      qrisId: business.value.qrisId,
      logoUrl: business.value.logoUrl,
      qrisQrUrl: business.value.qrisQrUrl,
    }, { merge: true })
    success = true
  } catch (err) {
    console.error('Error saving profile:', err)
  } finally {
    saving.value = false
    if (success) {
      toastStore.replace(tid, 'success', 'Business details saved successfully')
      savedName.value = business.value.name  // update title only after save
    } else {
      toastStore.replace(tid, 'error', 'Failed to save details. Please try again.')
    }
  }
}

// --- IMAGE COMPRESS + UPLOAD HELPERS ---
const compressImage = (file, maxWidth = 1024, quality = 0.85) =>
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
        canvas.toBlob((blob) => resolve(new File([blob], 'image.jpg', { type: 'image/jpeg' })), 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

const uploadImage = async (file, path) => {
  const ref = storageRef(storage, path)
  await uploadBytes(ref, file, { contentType: file.type })
  return await getDownloadURL(ref)
}

// --- LOGO UPLOAD ---
const handleLogoUpload = async (event) => {
  const raw = event.target.files[0]
  if (!raw) return
  const uid = getBizId()
  if (!uid) return
  logoUploading.value = true
  const tid = toastStore.loading('Uploading logo...')
  let success = false
  try {
    logoPreview.value = URL.createObjectURL(raw)
    const file = await compressImage(raw, 1024, 0.85)
    const url = await uploadImage(file, `business/${uid}/profile/avatar.jpg`)
    business.value.logoUrl = url
    logoPreview.value = url
    await setDoc(doc(db, 'businesses', uid), { logoUrl: url }, { merge: true })
    success = true
  } catch (err) {
    console.error('Logo upload failed:', err)
    logoPreview.value = business.value.logoUrl
  } finally {
    logoUploading.value = false
    if (success) {
      toastStore.replace(tid, 'success', 'Logo uploaded successfully')
    } else {
      toastStore.replace(tid, 'error', 'Logo upload failed. Please try again.')
    }
  }
}

// --- QRIS QR UPLOAD ---
const handleQrUpload = async (event) => {
  const raw = event.target.files[0]
  if (!raw) return
  const uid = getBizId()
  if (!uid) return
  qrUploading.value = true
  const tid = toastStore.loading('Uploading QR code...')
  let success = false
  try {
    qrPreview.value = URL.createObjectURL(raw)
    const file = await compressImage(raw, 1024, 0.9)
    const url = await uploadImage(file, `business/${uid}/profile/qris_qr.jpg`)
    business.value.qrisQrUrl = url
    qrPreview.value = url
    await setDoc(doc(db, 'businesses', uid), { qrisQrUrl: url }, { merge: true })
    success = true
  } catch (err) {
    console.error('QR upload failed:', err)
    qrPreview.value = business.value.qrisQrUrl
  } finally {
    qrUploading.value = false
    if (success) {
      toastStore.replace(tid, 'success', 'QR code uploaded successfully')
    } else {
      toastStore.replace(tid, 'error', 'QR upload failed. Please try again.')
    }
  }
}

// --- STAFF ---
const fetchStaff = async () => {
  const uid = getBizId()
  if (!uid) return
  try {
    const snap = await getDocs(collection(db, `businesses/${uid}/profiles`))
    staff.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('Error fetching staff:', err)
  }
}

const openAddStaffModal = () => {
  newStaff.value = { full_name: '', role: 'Cashier', pin: '' }
  isAddStaffModalOpen.value = true
}

const handleAddStaff = async () => {
  if (!newStaff.value.full_name || newStaff.value.pin.length !== 4) {
    toastStore.error('Please provide a name and a 4-digit PIN.')
    return
  }
  const uid = getBizId()
  const tid = toastStore.loading('Creating staff profile...')
  let success = false
  try {
    const profileId = `staff_${Date.now()}`
    await setDoc(doc(db, `businesses/${uid}/profiles`, profileId), {
      full_name: newStaff.value.full_name,
      role: newStaff.value.role,
      pin: newStaff.value.pin,
      created_at: new Date().toISOString()
    })
    await fetchStaff()
    success = true
  } catch (err) {
    console.error('Error adding staff:', err)
  } finally {
    if (success) {
      toastStore.replace(tid, 'success', 'Staff profile created successfully')
      isAddStaffModalOpen.value = false
    } else {
      toastStore.replace(tid, 'error', 'Failed to create staff profile. Please try again.')
    }
  }
}

const deleteStaff = async (profileId) => {
  if (profileId === 'owner') {
    toastStore.error('Cannot delete the Owner account.')
    return
  }
  if (confirm('Are you sure you want to remove this profile?')) {
    const uid = getBizId()
    const tid = toastStore.loading('Removing staff profile...')
    let success = false
    try {
      await deleteDoc(doc(db, `businesses/${uid}/profiles`, profileId))
      await fetchStaff()
      success = true
    } catch (err) {
      console.error('Error deleting staff:', err)
    } finally {
      if (success) {
        toastStore.replace(tid, 'success', 'Staff profile removed')
      } else {
        toastStore.replace(tid, 'error', 'Failed to remove staff profile. Please try again.')
      }
    }
  }
}

onMounted(async () => {
  await loadProfile()
  await fetchStaff()
})
</script>

<template>
  <section class="max-w-6xl mx-auto pb-20">
    <header class="mb-6">
      <div class="flex items-center gap-5 mb-4">
        <!-- Business Logo Display + Upload -->
        <div class="relative group shrink-0">
          <button type="button" @click="logoInput.click()" title="Click to change logo"
            class="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center shadow-sm hover:border-[#4DB6AC] transition-colors cursor-pointer">
            <img v-if="logoPreview" :src="logoPreview" class="w-full h-full object-cover" alt="Business logo" />
            <svg v-else class="w-8 h-8 text-gray-300 dark:text-gray-600 group-hover:text-[#4DB6AC] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </button>
          <div v-if="logoUploading" class="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center pointer-events-none">
            <svg class="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
          <input ref="logoInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp,image/gif" @change="handleLogoUpload" />
        </div>

        <div>
          <h2 class="text-3xl font-bold text-gray-800 dark:text-white">{{ savedName || 'Business Settings' }}</h2>
          <p class="mt-2 text-gray-600 dark:text-gray-400 mb-4">Click the logo to upload your business photo.</p>
        </div>
      </div>

      <button @click="saveProfile" :disabled="saving"
        class="bg-[#004D40] dark:bg-teal-700 text-white font-bold py-2.5 px-8 rounded-lg shadow hover:bg-[#003d33] dark:hover:bg-teal-600 transition-all active:scale-95 disabled:opacity-60">
        {{ saving ? 'Saving...' : 'Save Details' }}
      </button>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

      <div class="lg:col-span-2 space-y-6">

        <!-- Company Details -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Company Details</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Company Name</label>
              <input v-model="business.name" type="text"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none font-semibold text-lg text-[#004D40] dark:text-teal-400 transition-colors" />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Address</label>
              <input v-model="business.address" type="text"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white transition-colors" />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Phone</label>
              <input v-model="business.phone" type="text"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white transition-colors" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Website</label>
              <input v-model="business.website" type="text" placeholder="www.yourstore.com"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white transition-colors placeholder-gray-300 dark:placeholder-gray-600" />
            </div>
          </div>
        </div>

        <!-- Payment Details -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Payment Details (QRIS)</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Bank Name</label>
              <select v-model="business.bankName"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white">
                <option value="" class="dark:bg-gray-800">Select Bank</option>
                <option value="Maybank" class="dark:bg-gray-800">Maybank</option>
                <option value="CIMB" class="dark:bg-gray-800">CIMB Bank</option>
                <option value="Public Bank" class="dark:bg-gray-800">Public Bank</option>
                <option value="RHB" class="dark:bg-gray-800">RHB Bank</option>
                <option value="Bank Islam" class="dark:bg-gray-800">Bank Islam</option>
                <option value="Bank Rakyat" class="dark:bg-gray-800">Bank Rakyat</option>
                <option value="AmBank" class="dark:bg-gray-800">AmBank</option>
                <option value="Hong Leong" class="dark:bg-gray-800">Hong Leong Bank</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Account Number</label>
              <input v-model="business.accountNumber" type="text" placeholder="e.g. 1642..."
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white placeholder-gray-400 transition-colors" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Account Name</label>
              <input v-model="business.accountName" type="text" placeholder="e.g. Kedai Makan Sdn Bhd"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white placeholder-gray-400 transition-colors" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">QRIS ID</label>
              <input v-model="business.qrisId" type="text"
                class="w-full p-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-[#4DB6AC] outline-none text-gray-800 dark:text-white transition-colors" />
            </div>
          </div>
        </div>
      </div>

      <!-- QRIS QR Upload -->
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center transition-colors">
        <h4 class="font-bold text-gray-700 dark:text-white mb-4">QRIS QR Code</h4>

        <div class="group w-full">
          <button type="button" @click="qrInput.click()"
            class="w-full aspect-square max-w-50 mx-auto bg-gray-50 dark:bg-gray-700/30 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden hover:border-[#4DB6AC] dark:hover:border-teal-400 transition-all cursor-pointer">

            <img v-if="qrPreview" :src="qrPreview" class="absolute inset-0 w-full h-full object-contain p-2" alt="QRIS QR" />

            <div v-if="qrUploading" class="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl pointer-events-none">
              <svg class="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            </div>

            <div v-if="!qrPreview && !qrUploading" class="flex flex-col items-center px-4 pointer-events-none">
              <svg class="w-12 h-12 text-gray-300 dark:text-gray-500 group-hover:text-[#4DB6AC] dark:group-hover:text-teal-400 transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-xs text-gray-400 dark:text-gray-500">Upload QR Image</p>
            </div>

            <div v-if="qrPreview && !qrUploading" class="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 rounded-2xl pointer-events-none">
              <span class="text-white text-xs font-bold drop-shadow">Change QR</span>
            </div>
          </button>
          <input ref="qrInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp,image/gif" @change="handleQrUpload" />
        </div>

        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-4 leading-relaxed px-2">
          This QR will be displayed on digital invoices for customers to scan and pay.
        </p>
      </div>
    </div>

    <!-- Staff Management -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
      <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <h3 class="text-lg font-semibold text-gray-800 dark:text-white">Staff Management (Profiles)</h3>
        <button @click="openAddStaffModal"
          class="text-sm bg-[#004D40] dark:bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors font-bold">
          + Add New Staff
        </button>
      </div>
      <table class="w-full text-left">
        <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400 font-bold">
          <tr>
            <th class="px-6 py-4">Name</th>
            <th class="px-6 py-4">Role</th>
            <th class="px-6 py-4">Status</th>
            <th class="px-6 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr v-if="staff.length === 0">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No profiles found.</td>
          </tr>
          <tr v-for="user in staff" :key="user.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <td class="px-6 py-4">
              <div class="font-semibold text-gray-800 dark:text-white flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-800 dark:text-teal-300 text-xs font-bold">
                  {{ user.full_name?.charAt(0).toUpperCase() || 'U' }}
                </div>
                {{ user.full_name }}
              </div>
            </td>
            <td class="px-6 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">{{ user.role }}</td>
            <td class="px-6 py-4">
              <span class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full text-[10px] font-bold uppercase">Active</span>
            </td>
            <td class="px-6 py-4 text-right">
              <button v-if="user.id !== 'owner'" @click="deleteStaff(user.id)"
                class="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove Profile">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add Staff Modal -->
    <Teleport to="body">
      <div v-if="isAddStaffModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-800 w-full max-w-md rounded-lg shadow-xl overflow-hidden">
          <div class="p-5 border-b border-gray-100 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20 flex justify-between items-center">
            <h3 class="text-xl font-bold text-[#004D40] dark:text-teal-300">Create Staff Profile</h3>
            <button @click="isAddStaffModalOpen = false" class="text-gray-400 hover:text-gray-800 dark:hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Staff Name</label>
              <input v-model="newStaff.full_name" type="text" placeholder="e.g. Alice"
                class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:border-[#4DB6AC]" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <select v-model="newStaff.role"
                class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:border-[#4DB6AC]">
                <option v-for="role in roles" :key="role" :value="role">{{ role }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Login PIN (4 Digits)</label>
              <input v-model="newStaff.pin" type="text" inputmode="numeric" maxlength="4" placeholder="1234"
                class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:border-[#4DB6AC] tracking-widest text-center text-xl font-bold" />
            </div>
            <button @click="handleAddStaff"
              class="w-full mt-4 bg-[#004D40] dark:bg-teal-700 text-white font-bold py-2 rounded-lg hover:bg-[#00695C] dark:hover:bg-teal-600 transition-colors">
              Add Staff Profile
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </section>
</template>

