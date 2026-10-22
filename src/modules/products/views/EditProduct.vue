<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ProductFormScreen from '../components/ProductFormScreen.vue'

const route = useRoute()
const productId = computed(() => String(route.params.id || ''))
</script>

<template>
  <ProductFormScreen mode="edit" :product-id="productId" />
</template>
