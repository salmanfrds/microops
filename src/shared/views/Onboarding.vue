<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebaseClient'
import { useAuthStore } from '../../modules/auth/stores/auth'
import Logo from '../../assets/microopslogo.png'

const router = useRouter()
const authStore = useAuthStore()

// MicroOps is scoped to rental + services businesses only.
const DEFAULT_BUSINESS_TYPES = ['service', 'rental']

const businessInfo = reactive({ name: '', address: '', phone: '', website: '' })

const canProceed = computed(() => !!businessInfo.name.trim())

const saving = ref(false)

const completeOnboarding = async () => {
  if (!canProceed.value || saving.value) return
  saving.value = true
  try {
    const bizId = authStore.user.businessId
    await setDoc(doc(db, 'businesses', bizId), {
      name: businessInfo.name,
      address: businessInfo.address || '',
      phone: businessInfo.phone || '',
      website: businessInfo.website || '',
      businessTypes: DEFAULT_BUSINESS_TYPES,
      currency: 'IDR',
      onboardingCompleted: true,
    }, { merge: true })
    authStore.setUser({
      ...authStore.user,
      onboardingCompleted: true,
      businessTypes: DEFAULT_BUSINESS_TYPES,
      currency: 'IDR',
    })
    router.push('/')
  } catch (err) {
    console.error('Onboarding save failed:', err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#F8F7F4] dark:bg-gray-900 flex flex-col items-center justify-center p-6">

    <!-- Header bar -->
    <div class="w-full max-w-2xl mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img :src="Logo" class="w-10 h-10 rounded-xl object-cover" alt="MicroOps" />
        <span class="text-xl font-bold text-[#004D40] dark:text-teal-400">MicroOps</span>
      </div>
    </div>

    <!-- Card -->
    <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors">

      <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-1">Tell us about your business</h2>
      <p class="text-gray-500 dark:text-gray-400 mb-8">This info will appear on your invoices and receipts.</p>

      <div class="space-y-5">
        <div>
          <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Business Name <span class="text-red-400">*</span></label>
          <input v-model="businessInfo.name" type="text" placeholder="e.g. Bella's Rentals"
            class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white transition-shadow" />
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Address</label>
          <input v-model="businessInfo.address" type="text" placeholder="e.g. No.12, Jalan Bunga, Kuala Lumpur"
            class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input v-model="businessInfo.phone" type="tel" placeholder="011-1234 5678"
              class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white" />
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Website</label>
            <input v-model="businessInfo.website" type="url" placeholder="www.yourbiz.com"
              class="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none text-gray-800 dark:text-white" />
          </div>
        </div>

      </div>

      <!-- Footer actions -->
      <div class="flex justify-end items-center mt-10 pt-6 border-t border-gray-100 dark:border-gray-700">
        <button @click="completeOnboarding" :disabled="!canProceed || saving"
          class="bg-[#004D40] dark:bg-teal-600 text-white font-bold py-3 px-8 rounded-xl shadow hover:bg-[#00695C] dark:hover:bg-teal-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
          <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {{ saving ? 'Setting up…' : "Let's Get Started" }}
        </button>
      </div>
    </div>

    <p class="mt-6 text-xs text-gray-400 dark:text-gray-600 text-center">
      You can update business info anytime in Business Settings.
    </p>
  </div>
</template>
