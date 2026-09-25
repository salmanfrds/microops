import { createWebHistory, createRouter } from 'vue-router'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { firebaseApp } from '../../shared/lib/firebaseClient.js'
import { useAuthStore } from '../../modules/auth/stores/auth.js'

import Dashboard from '../../modules/dashboard/views/Dashboard.vue'
import Sales from '../../modules/sales/views/Sales.vue'
import Finance from '../../modules/finance/views/Finance.vue'
import Products from '../../modules/products/views/Products.vue'
import Customer from '../../modules/customer/views/Customer.vue'
import Discounts from '../../modules/customer/views/Discounts.vue'
import Profile from '../../modules/auth/views/Profile.vue'
import Login from '../../modules/auth/views/Login.vue'
import BusinessProfile from '../../modules/business/views/BusinessProfile.vue'
import FeatureLocked from '../../shared/views/FeatureLocked.vue'
import AccessDenied from '../../shared/views/AccessDenied.vue'
import Signup from '../../modules/auth/views/Signup.vue'
import SelectProfile from '../../modules/auth/views/SelectProfile.vue'
import Onboarding from '../../shared/views/Onboarding.vue'

const routes = [
    {
        path: '/',
        name: 'Dashboard',
        component: Dashboard,
        meta: { requireAuth: true, roles: ['Owner', 'Manager'] }
    },
    {
        path: '/select-profile',
        name: 'SelectProfile',
        component: SelectProfile,
        meta: { requireAuth: true, hideNavigation: true }
    },
    {
        path: '/sales',
        name: 'Sales',
        component: Sales,
        meta: { requireAuth: true, roles: ['Owner', 'Cashier'] }
    },
    {
        path: '/finance',
        name: 'Finance',
        component: Finance,
        meta: { requireAuth: true, roles: ['Owner', 'Manager'] }
    },
    {
        path: '/products',
        name: 'Products',
        component: Products,
        meta: { requireAuth: true, roles: ['Owner', 'Manager', 'Cashier'] }
    },
    {
        path: '/customer',
        name: 'Customer',
        component: Customer,
        meta: { requireAuth: true, roles: ['Owner', 'Cashier'] }
    },
    {
        path: '/discounts',
        name: 'Discounts',
        component: Discounts,
        meta: { requireAuth: true, roles: ['Owner', 'Manager', 'Cashier'] }
    },
    {
        path: '/profile',
        name: 'Profile',
        component: Profile,
        meta: { requireAuth: true } // all profiles can access their personal settings
    },
    {
        path: '/business',
        name: 'Business',
        component: BusinessProfile,
        meta: { requireAuth: true, roles: ['Owner', 'Manager'] }
    },
    {
        path: '/login',
        name: 'Login',
        component: Login,
        meta: { requireAuth: false }
    },
    {
        path: '/locked',
        name: 'Locked',
        component: FeatureLocked,
        meta: { requireAuth: true }
    },
    {
        path: '/access-denied',
        name: 'AccessDenied',
        component: AccessDenied,
        meta: { requireAuth: true }
    },
    {
        path: '/signup',
        name: 'Signup',
        component: Signup,
        meta: { requireAuth: false }
    },
    {
        path: '/onboarding',
        name: 'Onboarding',
        component: Onboarding,
        meta: { requireAuth: true, hideNavigation: true }
    },
]

export const router = createRouter({
    history: createWebHistory(),
    routes,
})

// Helper function to get current user robustly
const getCurrentUser = () => {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(getAuth(firebaseApp), user => {
            unsubscribe()
            resolve(user)
        }, reject)
    })
}

router.beforeEach(async (to, from, next) => {
    const requiresAuth = to.matched.some(record => record.meta.requireAuth)
    const requiredRoles = to.meta.roles // Array of allowed roles for the route
    const sessionUser = await getCurrentUser()
    const authStore = useAuthStore()

    // 1. Not logged in but trying to access a secure route -> Login
    if (requiresAuth && !sessionUser) {
        next('/login')
    }
    // 2. Logged in, but trying to go to login/signup -> Route depending on profile
    else if ((to.path === '/login' || to.path === '/signup') && sessionUser) {
        if (!authStore.user) {
            next('/select-profile')
        } else {
            next('/')
        }
    }
    // 3. Logged in, trying to access a secure app route (but NOT select-profile), AND no active profile in Pinia
    else if (requiresAuth && sessionUser && !authStore.user && to.path !== '/select-profile') {
        next('/select-profile')
    }
    // 4. Owner hasn't completed onboarding yet
    else if (requiresAuth && sessionUser && authStore.user && authStore.user.role === 'Owner' && authStore.user.onboardingCompleted === false && to.path !== '/onboarding') {
        next('/onboarding')
    }
    // 5. Logged in, HAS active profile, trying to access a protected route that requires specific roles
    else if (requiresAuth && sessionUser && authStore.user && requiredRoles) {
        if (!requiredRoles.includes(authStore.user.role)) {
            next('/access-denied')
        } else {
            next()
        }
    }
    // 6. Default pass through
    else {
        next()
    }
})