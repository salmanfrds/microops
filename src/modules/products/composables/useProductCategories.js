import { ref } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../shared/lib/firebaseClient'
import { useAuthStore } from '../../auth/stores/auth'

const DEFAULT_CATEGORIES = ['General', 'Equipment', 'Cleaning', 'Consulting']

export function useProductCategories() {
  const authStore = useAuthStore()
  const categories = ref([...DEFAULT_CATEGORIES])

  const settingsDoc = () => {
    const bizId = authStore.user?.businessId
    return bizId ? doc(db, 'businesses', bizId, 'settings', 'products') : null
  }

  const persist = async () => {
    const ref = settingsDoc()
    if (!ref) return
    await setDoc(ref, { categories: categories.value }, { merge: true })
  }

  const loadCategories = async () => {
    const ref = settingsDoc()
    if (!ref) return
    const snap = await getDoc(ref)
    if (snap.exists() && Array.isArray(snap.data().categories)) {
      categories.value = snap.data().categories
    }
  }

  const addCategory = async (label) => {
    const name = (label || '').trim()
    if (!name || categories.value.includes(name)) return null
    categories.value.push(name)
    await persist()
    return name
  }

  const removeCategory = async (name) => {
    const idx = categories.value.indexOf(name)
    if (idx === -1) return
    categories.value.splice(idx, 1)
    await persist()
  }

  return { categories, loadCategories, addCategory, removeCategory }
}
