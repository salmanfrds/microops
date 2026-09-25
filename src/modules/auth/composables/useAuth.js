import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'
import { firebaseApp } from '../../../shared/lib/firebaseClient.js'

export function useAuth() {
  const router = useRouter()
  const authStore = useAuthStore()

  const auth = getAuth(firebaseApp)
  const db = getFirestore(firebaseApp)

  // 1. Reactive Variables for UI State
  const loading = ref(false)
  const error = ref(null)

  // 2. Computed Properties (Read directly from Pinia)
  // This replaces "user.value" and ensures all components see the same data
  const user = computed(() => authStore.user)

  // 3. HELPER: Fetch Profile and Update Store
  const fetchProfile = async (firebaseUser) => {
    try {
      const docRef = doc(db, 'profiles', firebaseUser.uid)
      const docSnap = await getDoc(docRef)

      let profileData = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        full_name: firebaseUser.displayName || '',
      }

      if (docSnap.exists()) {
        profileData = { ...profileData, ...docSnap.data() }
      }

      // Update the Global Pinia Store
      authStore.setUser(profileData)

    } catch (err) {
      console.error('Error fetching profile:', err.message)
    }
  }

  // 4. LOGIN ACTION
  const login = async (email, password) => {
    loading.value = true
    error.value = null

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)

      if (userCredential.user) {
        // We no longer fetch profile into Pinia on login. 
        // We let the /select-profile screen handle profile loading.
        router.push('/select-profile')
      }
      return true
    } catch (err) {
      const code = err.code || ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        error.value = 'Incorrect email or password.'
      } else {
        error.value = err.message
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // 5. SIGNUP ACTION
  const signup = async (email, password, fullName, pinStr) => {
    loading.value = true
    error.value = null

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)

      if (userCredential.user) {
        // Update Firebase User Profile
        await updateProfile(userCredential.user, {
          displayName: fullName
        })

        // Setup initial user data in Firestore
        // The main document represents the Business Account
        const bizRef = doc(db, 'businesses', userCredential.user.uid)
        await setDoc(bizRef, {
          owner_email: email,
          created_at: new Date().toISOString(),
          onboardingCompleted: false,
          businessTypes: ['service', 'rental'],
          currency: 'IDR'
        })

        // The sub-collection 'profiles' represents the Netflix-style users (Owner, Staff)
        const ownerProfileRef = doc(db, `businesses/${userCredential.user.uid}/profiles`, 'owner')
        await setDoc(ownerProfileRef, {
          full_name: fullName,
          role: 'Owner',
          pin: pinStr, // Storing PIN for client-side unlocking
          created_at: new Date().toISOString()
        })

        // Populate the store immediately — no profile selection needed after fresh signup
        authStore.setUser({
          id: 'owner',
          full_name: fullName,
          role: 'Owner',
          pin: pinStr,
          businessId: userCredential.user.uid,
          profileId: 'owner',
          email,
          onboardingCompleted: false,
          businessTypes: ['service', 'rental'],
          currency: 'IDR',
        })
        router.push('/onboarding')
      }
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  // 6. LOGOUT ACTION
  const logout = async () => {
    try {
      await signOut(auth)
      authStore.logout() // Clear Pinia
      router.push('/login')
    } catch (err) {
      console.log(err)
      error.value = err.message
    }
  }

  // 7. INITIALIZE (Run in App.vue or router)
  let sessionCheckPromise = null
  const checkSession = () => {
    if (!sessionCheckPromise) {
      sessionCheckPromise = new Promise((resolve) => {
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (!firebaseUser) {
            // If session is gone, clear store
            authStore.logout()
          }
          // Note: We no longer auto-fetch a profile here.
          // The authStore.user remains null until they log in via /select-profile
          resolve(firebaseUser)
        })
      })
    }
    return sessionCheckPromise
  }

  return {
    user,      // Exposing the computed store value
    loading,
    error,
    login,
    signup,
    logout,
    checkSession
  }
}