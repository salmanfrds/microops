<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAuth } from 'firebase/auth'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { firebaseApp } from '../../../shared/lib/firebaseClient'
import { useAuthStore } from '../stores/auth'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const authStore = useAuthStore()
const { logout } = useAuth()

const profiles = ref([])
const loading = ref(true)

// PIN Modal State
const selectedProfile = ref(null)
const enteredPin = ref('')
const pinError = ref('')
const isPinModalOpen = ref(false)

onMounted(async () => {
  const auth = getAuth(firebaseApp)
  const db = getFirestore(firebaseApp)
  
  if (!auth.currentUser) {
    router.push('/login')
    return
  }

  try {
    const profilesRef = collection(db, `businesses/${auth.currentUser.uid}/profiles`)
    const snapshot = await getDocs(profilesRef)
    
    profiles.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Single profile — skip the grid and go straight to the PIN prompt
    if (profiles.value.length === 1) {
      handleProfileClick(profiles.value[0])
    }
  } catch (err) {
    console.error("Error fetching profiles:", err)
  } finally {
    loading.value = false
  }
})

const handleProfileClick = (profile) => {
  selectedProfile.value = profile
  enteredPin.value = ''
  pinError.value = ''
  isPinModalOpen.value = true
}

const verifyPin = async () => {
  if (enteredPin.value === selectedProfile.value.pin) {
    const db = getFirestore(firebaseApp)
    const bizId = getAuth(firebaseApp).currentUser.uid

    let onboardingCompleted = true

    try {
      const bizSnap = await getDoc(doc(db, 'businesses', bizId))
      if (bizSnap.exists()) {
        if (selectedProfile.value.role === 'Owner') {
          onboardingCompleted = bizSnap.data().onboardingCompleted ?? true
        }
      }
    } catch (err) {
      console.error('Failed to fetch business flags:', err)
    }

    authStore.setUser({
      ...selectedProfile.value,
      businessId: bizId,
      profileId: selectedProfile.value.id,
      email: getAuth(firebaseApp).currentUser.email,
      onboardingCompleted,
      businessTypes: ['service', 'rental'],
      currency: 'IDR',
    })

    const roleDefaultRoute = {
      'Owner':             '/',
      'Manager':           '/',
      'Cashier':           '/sales',
    }
    const defaultRoute = roleDefaultRoute[selectedProfile.value.role] ?? '/'

    isPinModalOpen.value = false
    router.push(onboardingCompleted ? defaultRoute : '/onboarding')
  } else {
    pinError.value = "Incorrect PIN. Try again."
    enteredPin.value = ''
  }
}

const handleLogout = async () => {
  await logout()
}

// Quick UI helper class array for random profile colors
const avatarColors = [
  'bg-blue-500 text-white',
  'bg-teal-500 text-white', 
  'bg-purple-500 text-white',
  'bg-orange-500 text-white',
  'bg-pink-500 text-white'
]
const getAvatarColor = (idx) => avatarColors[idx % avatarColors.length]
</script>

<template>
  <div class="min-h-screen bg-[#141414] text-white flex flex-col items-center justify-center p-4">
    
    <!-- Header -->
    <div class="mb-12 text-center">
      <h1 class="text-4xl md:text-5xl font-light mb-4 tracking-wide">Who's working?</h1>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center space-y-4">
      <div class="w-12 h-12 border-4 border-gray-600 border-t-teal-500 rounded-full animate-spin"></div>
      <p class="text-gray-400">Loading profiles...</p>
    </div>

    <!-- Profiles Grid -->
    <div v-else class="flex flex-wrap justify-center gap-8 md:gap-12 max-w-4xl">
      
      <!-- Individual Profile Card -->
      <div 
        v-for="(profile, index) in profiles" 
        :key="profile.id"
        class="group flex flex-col items-center cursor-pointer transition-transform transform hover:scale-110"
        @click="handleProfileClick(profile)"
      >
        <div :class="[
          'w-28 h-28 md:w-36 md:h-36 rounded-xl shadow-lg flex items-center justify-center text-4xl font-bold mb-3 overflow-hidden border-2',
          selectedProfile?.id === profile.id ? 'border-teal-400' : 'border-transparent group-hover:border-gray-300',
          profile.avatarUrl ? '' : getAvatarColor(index)
        ]">
          <!-- Show avatar photo if available, else initials -->
          <img v-if="profile.avatarUrl" :src="profile.avatarUrl" class="w-full h-full object-cover" alt="" />
          <template v-else>{{ profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U' }}</template>
        </div>
        <p class="text-gray-400 group-hover:text-white font-medium text-lg">{{ profile.full_name }}</p>
        <span class="text-xs text-gray-500 mt-1 uppercase tracking-widest">{{ profile.role }}</span>
      </div>

    </div>

    <!-- PIN Modal Overlay -->
    <Teleport to="body">
      <div v-if="isPinModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
        
        <div class="bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl p-8 border border-gray-800 flex flex-col items-center text-center relative animate-fade-in-up">
          
          <button @click="isPinModalOpen = false" class="absolute top-4 right-4 text-gray-500 hover:text-white">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <p class="text-xl font-medium text-white mb-2">Welcome back, {{ selectedProfile?.full_name?.split(' ')[0] }}</p>
          <p class="text-gray-400 text-sm mb-6">Enter your 4-digit PIN</p>

          <input 
            v-model="enteredPin" 
            type="password" 
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            class="w-3/4 p-4 bg-gray-800 border-2 border-gray-700 rounded-xl focus:ring-0 focus:border-teal-500 outline-none text-white text-center tracking-[1em] font-bold text-2xl transition-colors"
            @keyup.enter="verifyPin"
            placeholder="••••"
            autofocus
          >

          <p v-if="pinError" class="mt-4 text-red-500 text-sm font-medium">{{ pinError }}</p>

          <button 
            @click="verifyPin" 
            class="mt-6 w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-colors"
          >
            Unlock Profile
          </button>

        </div>
      </div>
    </Teleport>

    <!-- Logout Button (Bottom) -->
    <div class="absolute top-8 right-8">
      <button 
        @click="handleLogout"
        class="text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded uppercase text-sm font-bold tracking-widest transition-colors"
      >
        Sign Out Business
      </button>
    </div>

  </div>
</template>

<style scoped>
/* Optional Netflix-esque fade down animation */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
</style>
