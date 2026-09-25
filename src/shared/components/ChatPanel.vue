<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../../modules/auth/stores/auth'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const chatStore = useChatStore()
const authStore = useAuthStore()

const input = ref('')
const listRef = ref(null)
const sending = ref(false)

const myId = computed(() => authStore.user?.profileId || authStore.user?.id)

const scrollToBottom = () => {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

watch(() => chatStore.messages.length, scrollToBottom)
watch(() => props.open, (v) => {
  if (v) {
    chatStore.markSeen()
    scrollToBottom()
  }
})

const send = async () => {
  if (!input.value.trim() || sending.value) return
  sending.value = true
  const text = input.value
  input.value = ''
  await chatStore.sendMessage(text)
  chatStore.markSeen()
  sending.value = false
}

const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

const formatTime = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const formatDay = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

// Group messages: show day divider when date changes
const grouped = computed(() => {
  const result = []
  let lastDay = ''
  for (const m of chatStore.messages) {
    const day = m.createdAt ? formatDay(m.createdAt) : ''
    if (day && day !== lastDay) {
      result.push({ type: 'divider', label: day })
      lastDay = day
    }
    result.push({ type: 'message', ...m })
  }
  return result
})

const initial = (name = '') => name.trim().charAt(0).toUpperCase() || '?'

const avatarColor = (role = '') => {
  const map = {
    Owner: 'bg-teal-500',
    Manager: 'bg-blue-500',
    Cashier: 'bg-orange-500',
  }
  return map[role] || 'bg-gray-500'
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop (mobile) -->
    <div v-if="open" @click="emit('close')"
      class="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden" />

    <!-- Panel -->
    <transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full">
      <div v-if="open"
        class="fixed right-0 z-50 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl
               top-14 h-[calc(100vh-3.5rem)] w-full
               lg:top-0 lg:h-screen lg:w-80">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-700 bg-[#004D40] dark:bg-teal-900">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <h2 class="font-bold text-white text-base">Team Chat</h2>
          </div>
          <button @click="emit('close')" class="text-teal-200 hover:text-white transition-colors p-1 rounded">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Messages -->
        <div ref="listRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          <div v-if="chatStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 gap-2">
            <svg class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p class="text-sm font-medium">No messages yet</p>
            <p class="text-xs">Start the conversation!</p>
          </div>

          <template v-for="item in grouped" :key="item.id || item.label">
            <!-- Day divider -->
            <div v-if="item.type === 'divider'" class="flex items-center gap-3 my-2">
              <div class="flex-1 h-px bg-gray-100 dark:bg-gray-700"></div>
              <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{{ item.label }}</span>
              <div class="flex-1 h-px bg-gray-100 dark:bg-gray-700"></div>
            </div>

            <!-- Message -->
            <div v-else :class="item.senderId === myId ? 'flex-row-reverse' : 'flex-row'" class="flex items-end gap-2">
              <!-- Avatar (only for others) -->
              <div v-if="item.senderId !== myId"
                :class="avatarColor(item.senderRole)"
                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
                {{ initial(item.senderName) }}
              </div>

              <div :class="item.senderId === myId ? 'items-end' : 'items-start'" class="flex flex-col max-w-[78%] gap-0.5">
                <!-- Sender name (only for others) -->
                <span v-if="item.senderId !== myId" class="text-[10px] text-gray-400 dark:text-gray-500 font-bold ml-0.5">
                  {{ item.senderName }} · {{ item.senderRole }}
                </span>

                <!-- Bubble -->
                <div :class="item.senderId === myId
                  ? 'bg-[#004D40] dark:bg-teal-700 text-white rounded-2xl rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm'"
                  class="px-3 py-2 text-sm leading-relaxed break-words">
                  {{ item.text }}
                </div>

                <!-- Time -->
                <span class="text-[9px] text-gray-400 dark:text-gray-500 px-0.5">{{ formatTime(item.createdAt) }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- Input -->
        <div class="px-3 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div class="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus-within:border-teal-400 dark:focus-within:border-teal-500 transition-colors">
            <textarea
              v-model="input"
              @keydown="handleKeydown"
              rows="1"
              placeholder="Message team…"
              class="flex-1 bg-transparent text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none outline-none leading-relaxed max-h-28 overflow-y-auto"
              style="field-sizing: content"
            ></textarea>
            <button @click="send" :disabled="!input.trim() || sending"
              class="shrink-0 w-8 h-8 rounded-full bg-[#004D40] dark:bg-teal-700 text-white flex items-center justify-center disabled:opacity-30 hover:bg-[#00695C] transition-colors">
              <svg class="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
        </div>

      </div>
    </transition>
  </Teleport>
</template>
