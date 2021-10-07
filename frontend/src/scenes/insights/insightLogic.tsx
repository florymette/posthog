import { kea } from 'kea'
import { errorToast } from 'lib/utils'
import posthog from 'posthog-js'
import { eventUsageLogic, InsightEventSource } from 'lib/utils/eventUsageLogic'
import { insightLogicType } from './insightLogicType'
import {
    DashboardItemType,
    Entity,
    FilterType,
    FunnelVizType,
    InsightLogicProps,
    ItemMode,
    PropertyFilter,
    ViewType,
} from '~/types'
import { captureInternalMetric } from 'lib/internalMetrics'
import { Scene, sceneLogic } from 'scenes/sceneLogic'
import { router } from 'kea-router'
import api from 'lib/api'
import { toast } from 'react-toastify'
import React from 'react'
import { Link } from 'lib/components/Link'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { FEATURE_FLAGS } from 'lib/constants'

const IS_TEST_MODE = process.env.NODE_ENV === 'test'

export const TRENDS_BASED_INSIGHTS = ['TRENDS', 'SESSIONS', 'STICKINESS', 'LIFECYCLE'] // Insights that are based on the same `Trends` components

/*
InsightLogic maintains state for changing between insight features
This includes handling the urls and view state
*/

const SHOW_TIMEOUT_MESSAGE_AFTER = 15000
export const defaultFilterTestAccounts = (): boolean => {
    return localStorage.getItem('default_filter_test_accounts') === 'true' || false
}

interface UrlParams {
    insight: string
    properties: PropertyFilter[] | undefined
    filter_test_accounts: boolean
    funnel_viz_type?: string
    display?: string
    events?: Entity[]
    actions?: Entity[]
}

export const insightLogic = kea<insightLogicType>({
    props: {} as InsightLogicProps,
    key: (props) => {
        if (!('dashboardItemId' in props)) {
            throw new Error('Must init with dashboardItemId, even if undefined')
        }
        return props.dashboardItemId || 'new'
    },
    actions: () => ({
        setActiveView: (type: ViewType) => ({ type }),
        updateActiveView: (type: ViewType) => ({ type }),
        setAllFilters: (filters) => ({ filters }),
        startQuery: (queryId: string) => ({ queryId }),
        endQuery: (queryId: string, view: ViewType, lastRefresh: string | null, exception?: Record<string, any>) => ({
            queryId,
            view,
            lastRefresh,
            exception,
        }),
        abortQuery: (queryId: string, view: ViewType, scene: Scene | null, exception?: Record<string, any>) => ({
            queryId,
            view,
            scene,
            exception,
        }),
        setMaybeShowTimeoutMessage: (showTimeoutMessage: boolean) => ({ showTimeoutMessage }),
        setShowTimeoutMessage: (showTimeoutMessage: boolean) => ({ showTimeoutMessage }),
        setShowErrorMessage: (showErrorMessage: boolean) => ({ showErrorMessage }),
        setIsLoading: (isLoading: boolean) => ({ isLoading }),
        setTimeout: (timeout: number | null) => ({ timeout }),
        setLastRefresh: (lastRefresh: string | null) => ({ lastRefresh }),
        setNotFirstLoad: () => {},
        toggleControlsCollapsed: true,
        saveNewTag: (tag: string) => ({ tag }),
        deleteTag: (tag: string) => ({ tag }),
        setInsight: (insight: Partial<DashboardItemType>, shouldMergeWithExisting: boolean = false) => ({
            insight,
            shouldMergeWithExisting,
        }),
        setInsightMode: (mode: ItemMode, source: InsightEventSource | null) => ({ mode, source }),
        setInsightDescription: (description: string) => ({ description }),
        saveInsight: true,
        updateInsightFilters: (filters: FilterType) => ({ filters }),
        setTagLoading: (tagLoading: boolean) => ({ tagLoading }),
        setAsSaved: (insight: Partial<DashboardItemType>) => ({ insight }),
    }),
    loaders: ({ values, props }) => ({
        insight: [
            (props.cachedResults || { tags: [] }) as Partial<DashboardItemType>,
            {
                loadInsight: async (id: number) => await api.get(`api/insight/${id}`),
                updateInsight: async (payload: Partial<DashboardItemType>, breakpoint) => {
                    if (!Object.entries(payload).length) {
                        return
                    }
                    await breakpoint(300)
                    return await api.update(`api/insight/${values.insight.id}`, payload)
                },
                setInsight: ({ insight, shouldMergeWithExisting }) =>
                    shouldMergeWithExisting
                        ? {
                              ...values.insight,
                              ...insight,
                          }
                        : insight,
                updateInsightFilters: ({ filters }) => ({ ...values.insight, filters }),
            },
        ],
    }),
    reducers: {
        showTimeoutMessage: [false, { setShowTimeoutMessage: (_, { showTimeoutMessage }) => showTimeoutMessage }],
        maybeShowTimeoutMessage: [
            false,
            {
                // Only show timeout message if timer is still running
                setShowTimeoutMessage: (_, { showTimeoutMessage }) => showTimeoutMessage,
                endQuery: (_, { exception }) => !!exception && exception.status !== 500,
                startQuery: () => false,
                setActiveView: () => false,
            },
        ],
        showErrorMessage: [false, { setShowErrorMessage: (_, { showErrorMessage }) => showErrorMessage }],
        maybeShowErrorMessage: [
            false,
            {
                endQuery: (_, { exception }) => exception?.status >= 400,
                startQuery: () => false,
                setActiveView: () => false,
            },
        ],
        activeView: [
            ViewType.TRENDS as ViewType,
            {
                updateActiveView: (_, { type }) => type,
            },
        ],
        timeout: [null as number | null, { setTimeout: (_, { timeout }) => timeout }],
        lastRefresh: [
            null as string | null,
            {
                setLastRefresh: (_, { lastRefresh }) => lastRefresh,
                setActiveView: () => null,
            },
        ],
        isLoading: [
            false,
            {
                setIsLoading: (_, { isLoading }) => isLoading,
            },
        ],
        /*
        allfilters is passed to components that are shared between the different insight features
        */
        allFilters: [
            {} as FilterType,
            {
                setAllFilters: (_, { filters }) => filters,
            },
        ],
        /*
        isFirstLoad determines if this is the first graph being shown after the component is mounted (used for analytics)
        */
        isFirstLoad: [
            true,
            {
                setNotFirstLoad: () => false,
            },
        ],
        controlsCollapsed: [
            false,
            {
                toggleControlsCollapsed: (state) => !state,
            },
        ],
        queryStartTimes: [
            {} as Record<string, number>,
            {
                startQuery: (state, { queryId }) => ({ ...state, [queryId]: new Date().getTime() }),
            },
        ],
        lastInsightModeSource: [
            null as InsightEventSource | null,
            {
                setInsightMode: (_, { source }) => source,
            },
        ],
        insightMode: [
            ItemMode.View as ItemMode,
            {
                setInsightMode: (_, { mode }) => mode,
            },
        ],
        tagLoading: [
            false,
            {
                setTagLoading: (_, { tagLoading }) => tagLoading,
            },
        ],
    },
    selectors: {
        insightProps: [() => [(_, props) => props], (props): InsightLogicProps => props],
        insightName: [(s) => [s.insight], (insight) => insight.name],
    },
    listeners: ({ actions, values, props }) => ({
        updateInsightSuccess: () => {
            actions.setInsightMode(ItemMode.View, null)
        },
        setAllFilters: async (filters, breakpoint) => {
            const { fromDashboard } = router.values.hashParams
            eventUsageLogic.actions.reportInsightViewed(filters.filters, values.isFirstLoad, Boolean(fromDashboard))
            actions.setNotFirstLoad()

            // tests will wait for all breakpoints to finish
            await breakpoint(IS_TEST_MODE ? 1 : 10000)
            eventUsageLogic.actions.reportInsightViewed(filters.filters, values.isFirstLoad, Boolean(fromDashboard), 10)
        },
        startQuery: () => {
            actions.setShowTimeoutMessage(false)
            actions.setShowErrorMessage(false)
            values.timeout && clearTimeout(values.timeout || undefined)
            const view = values.activeView
            actions.setTimeout(
                window.setTimeout(() => {
                    if (values && view == values.activeView) {
                        actions.setShowTimeoutMessage(true)
                        const tags = {
                            insight: values.activeView,
                            scene: sceneLogic.values.scene,
                        }
                        posthog.capture('insight timeout message shown', tags)
                        captureInternalMetric({ method: 'incr', metric: 'insight_timeout', value: 1, tags })
                    }
                }, SHOW_TIMEOUT_MESSAGE_AFTER)
            )
            actions.setIsLoading(true)
        },
        abortQuery: ({ queryId, view, scene, exception }) => {
            const duration = new Date().getTime() - values.queryStartTimes[queryId]
            const tags = {
                insight: view,
                scene: scene,
                success: !exception,
                ...exception,
            }

            posthog.capture('insight aborted', { ...tags, duration })
            captureInternalMetric({ method: 'timing', metric: 'insight_abort_time', value: duration, tags })
        },
        endQuery: ({ queryId, view, lastRefresh, exception }) => {
            if (values.timeout) {
                clearTimeout(values.timeout)
            }
            if (view === values.activeView) {
                actions.setShowTimeoutMessage(values.maybeShowTimeoutMessage)
                actions.setShowErrorMessage(values.maybeShowErrorMessage)
                actions.setLastRefresh(lastRefresh || null)
                actions.setIsLoading(false)

                const duration = new Date().getTime() - values.queryStartTimes[queryId]
                const tags = {
                    insight: values.activeView,
                    scene: sceneLogic.values.scene,
                    success: !exception,
                    ...exception,
                }

                posthog.capture('insight loaded', { ...tags, duration })
                captureInternalMetric({ method: 'timing', metric: 'insight_load_time', value: duration, tags })
                if (values.maybeShowErrorMessage) {
                    posthog.capture('insight error message shown', { ...tags, duration })
                }
            }
        },
        setActiveView: () => {
            actions.setShowTimeoutMessage(false)
            actions.setShowErrorMessage(false)
            if (values.timeout) {
                clearTimeout(values.timeout)
            }
        },
        toggleControlsCollapsed: async () => {
            eventUsageLogic.actions.reportInsightsControlsCollapseToggle(values.controlsCollapsed)
        },
        saveNewTag: async ({ tag }, breakpoint) => {
            actions.setTagLoading(true)
            if (values.insight.tags?.includes(tag)) {
                errorToast(undefined, 'Oops! Your insight already has that tag.')
                actions.setTagLoading(false)
                return
            }
            actions.setInsight({ ...values.insight, tags: [...(values.insight.tags || []), tag] })
            await breakpoint(100)
            actions.setTagLoading(false)
        },
        deleteTag: async ({ tag }, breakpoint) => {
            await breakpoint(100)
            actions.setInsight({ ...values.insight, tags: values.insight.tags?.filter((_tag) => _tag !== tag) })
        },
        saveInsight: async () => {
            const savedInsight = await api.update(`api/insight/${values.insight.id}`, {
                ...values.insight,
                saved: true,
            })
            actions.setInsight(savedInsight)
            toast(
                <div data-attr="success-toast">
                    Insight saved!&nbsp;
                    <Link to={'/saved_insights'}>Click here to see your list of saved insights</Link>
                </div>
            )
        },
        updateInsightFilters: async ({ filters }) => {
            if (featureFlagLogic.values.featureFlags[FEATURE_FLAGS.SAVED_INSIGHTS]) {
                await api.update(`api/insight/${values.insight.id}`, { filters })
            }
        },
        setAsSaved: async ({ insight }) => {
            // :TRICKY:
            // - this logic is mounted with the key as "new", if we save an ID here, the logic will invalidate
            // - so boot up a new logic with the ID as the key, and preload the results.
            // - assume it'll take max 5sec for the frontend to switch over to the new logic
            const logicWithId = insightLogic.build(
                {
                    ...props,
                    dashboardItemId: insight.id,
                    cachedResults: insight.result,
                    filters: insight.filters,
                },
                false
            )
            const unmount = logicWithId.mount()
            window.setTimeout(() => unmount(), 5000)
            if (props.syncWithUrl) {
                router.actions.replace('/insights', router.values.searchParams, {
                    ...router.values.hashParams,
                    fromItem: insight.id,
                })
            }
            actions.setInsight(insight)
        },
    }),
    actionToUrl: ({ actions, values, props }) => ({
        setActiveView: ({ type }) => {
            if (props.syncWithUrl) {
                actions.updateActiveView(type)

                const urlParams: UrlParams = {
                    insight: type,
                    properties: values.allFilters.properties,
                    filter_test_accounts: defaultFilterTestAccounts(),
                    events: (values.allFilters.events || []) as Entity[],
                    actions: (values.allFilters.actions || []) as Entity[],
                }

                if (type === ViewType.FUNNELS) {
                    urlParams.funnel_viz_type = FunnelVizType.Steps
                    urlParams.display = 'FunnelViz'
                }
                return ['/insights', urlParams, { ...router.values.hashParams, fromItem: values.insight.id || null }]
            }
        },
    }),
    urlToAction: ({ actions, values, props }) => ({
        '/insights': (_: any, searchParams: Record<string, any>, hashParams: Record<string, any>) => {
            if (props.syncWithUrl) {
                if (searchParams.insight && searchParams.insight !== values.activeView) {
                    actions.updateActiveView(searchParams.insight)
                }
                if (hashParams.fromItem) {
                    actions.loadInsight(hashParams.fromItem)
                } else {
                    actions.setInsightMode(ItemMode.Edit, null)
                }
            }
        },
    }),
    events: ({ values }) => ({
        beforeUnmount: () => {
            if (values.timeout) {
                clearTimeout(values.timeout)
            }
            toast.dismiss()
        },
    }),
})
