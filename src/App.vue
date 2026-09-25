<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import Sidebar from './shared/components/Sidebar.vue';
import Header from './shared/components/Header.vue';
import ChatPanel from './shared/components/ChatPanel.vue';
import ToastContainer from './shared/components/ToastContainer.vue';
import Logo from './assets/microopslogo.png';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './modules/auth/stores/auth';
import { useChatStore } from './shared/stores/chat';
import { useAuth } from './modules/auth/composables/useAuth';
import { useDarkMode } from './shared/composables/useDarkMode';

const isSidebarExpanded = ref(true)
const isMobileMenuOpen = ref(false)
const isChatOpen = ref(false)

const toggleSidebar = () => { isSidebarExpanded.value = !isSidebarExpanded.value }

const route = useRoute()
const router = useRouter()
const requireAuth = computed(() => route.meta.requireAuth === true)
const hideNavigation = computed(() => route.meta.hideNavigation === true)

// Close mobile menu on navigation
watch(() => route.path, () => { isMobileMenuOpen.value = false })

const authStore = useAuthStore()
const chatStore = useChatStore()

const { isDark, toggleDarkMode, init: initDarkMode } = useDarkMode()

onMounted(() => {
  initDarkMode()
})

const isMobileDropdownOpen = ref(false)
const mobileDropdownRef = ref(null)

const closeMobileDropdown = (e) => {
  if (mobileDropdownRef.value && !mobileDropdownRef.value.contains(e.target)) {
    isMobileDropdownOpen.value = false
  }
}

watch(isMobileDropdownOpen, (v) => {
  if (v) document.addEventListener('click', closeMobileDropdown)
  else document.removeEventListener('click', closeMobileDropdown)
})

const { logout } = useAuth()

const mobileNavigate = (path) => {
  isMobileDropdownOpen.value = false
  router.push(path)
}

const mobileLogout = async () => {
  isMobileDropdownOpen.value = false
  await logout()
}

const mobileSwitchProfile = () => {
  isMobileDropdownOpen.value = false
  authStore.setUser(null)
  router.push('/select-profile')
}
</script>

<template>
  <div v-if="requireAuth && !hideNavigation" class="flex h-screen overflow-hidden bg-[#F8F7F4] dark:bg-gray-900 text-[#5A5A5A] dark:text-gray-100 transition-colors duration-300">

    <!-- Mobile top bar -->
    <div class="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-sm flex items-center px-4 gap-3 shrink-0">
      <button @click="isMobileMenuOpen = true"
        class="p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <img :src="Logo" class="w-7 h-7 rounded-full object-cover" alt="Logo" />
      <span class="font-bold text-[#004D40] dark:text-teal-400 text-base">MicroOps</span>

      <div class="flex-1" />

      <!-- Chat -->
      <button @click="isChatOpen = !isChatOpen"
        class="relative p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span v-if="chatStore.unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
          {{ chatStore.unreadCount > 9 ? '9+' : chatStore.unreadCount }}
        </span>
      </button>

      <!-- Dark mode toggle -->
      <button @click="toggleDarkMode"
        class="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <svg v-if="!isDark" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <!-- User avatar → dropdown -->
      <div ref="mobileDropdownRef" class="relative">
        <button @click.stop="isMobileDropdownOpen = !isMobileDropdownOpen"
          class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 text-[#004D40] dark:text-teal-400 flex items-center justify-center font-bold text-sm shrink-0">
          {{ authStore.user?.full_name?.charAt(0)?.toUpperCase() || 'U' }}
        </button>

        <!-- Mobile profile dropdown -->
        <transition enter-active-class="transition duration-150 ease-out" enter-from-class="scale-95 opacity-0"
kkkkk          enter-to-class="scale-100 opacity-100" leave-active-class="transition duration-100 ease-in"
          leave-from-class="scale-100 opacity-100" leave-to-class="scale-95 opacity-0">
          <div v-if="isMobileDropdownOpen"
            class="absolute right-0 top-10 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">

            <!-- User info -->
            <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <p class="text-sm font-bold text-gray-800 dark:text-white truncate">{{ authStore.user?.full_name }}</p>
              <p class="text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-0.5">{{ authStore.user?.role }}</p>
            </div>

            <ul class="py-1">
              <li>
                <button @click="mobileSwitchProfile"
                  class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors">
                  <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Switch Profile
                </button>
              </li>
              <li v-if="authStore.user?.role === 'Owner' || authStore.user?.role === 'Manager'">
                <button @click="mobileNavigate('/business')"
                  class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors">
                  <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Business Settings
                </button>
              </li>
            </ul>

            <div class="border-t border-gray-100 dark:border-gray-700 p-1">
              <button @click="mobileLogout"
                class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg flex items-center gap-2 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign Out
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Desktop floating header -->
    <Header @toggle-chat="isChatOpen = !isChatOpen" />

    <!-- Sidebar -->
    <Sidebar
      :isExpanded="isSidebarExpanded"
      :isMobileOpen="isMobileMenuOpen"
      @toggle="toggleSidebar"
      @mobile-close="isMobileMenuOpen = false"
    />

    <ChatPanel :open="isChatOpen" @close="isChatOpen = false" />

    <main class="flex-1 overflow-y-auto transition-all duration-300 pt-14 lg:pt-0">
      <div class="p-5 md:p-10 dark:text-gray-100">
        <router-view />
      </div>
    </main>
  </div>

  <div v-else class="h-screen w-full bg-[#F8F7F4] dark:bg-gray-900 transition-colors duration-300">
    <router-view />
  </div>

  <ToastContainer />
</template>
