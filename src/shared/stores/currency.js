import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useCurrencyStore = defineStore('currency', () => {
  const symbol = computed(() => 'Rp')

  const fmt = (value) => {
    return `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`
  }

  return { symbol, fmt }
})
