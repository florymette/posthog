import { kea } from 'kea'
import api from 'lib/api'
import { toParams } from 'lib/utils'
import { FilterType, PropertyOperator, RecordingDurationFilter, SessionRecordingType } from '~/types'
import { sessionRecordingsTableLogicType } from './sessionRecordingsTableLogicType'
import { router } from 'kea-router'
import dayjs from 'dayjs'

export type SessionRecordingId = string
export type PersonUUID = string
interface Params {
    properties?: any
    sessionRecordingId?: SessionRecordingId
}

export interface SessionRecordingsResponse {
    results: SessionRecordingType[]
    has_next: boolean
}

const LIMIT = 50

export const sessionRecordingsTableLogic = kea<
    sessionRecordingsTableLogicType<PersonUUID, SessionRecordingId, SessionRecordingsResponse>
>({
    key: (props) => props.personUUID || 'global',
    props: {} as {
        personUUID?: PersonUUID
    },
    actions: {
        getSessionRecordings: true,
        openSessionPlayer: (sessionRecordingId: SessionRecordingId | null) => ({ sessionRecordingId }),
        closeSessionPlayer: true,
        setEntityFilters: (filters: Partial<FilterType>) => ({ filters }),
        loadNext: true,
        loadPrev: true,
        setDateRange: (incomingFromDate: string | null, incomingToDate: string | null) => ({
            incomingFromDate,
            incomingToDate,
        }),
        setDurationFilter: (durationFilter: RecordingDurationFilter) => ({ durationFilter }),
    },
    loaders: ({ props, values }) => ({
        sessionRecordingsResponse: [
            {
                results: [],
                has_next: false,
            } as SessionRecordingsResponse,
            {
                getSessionRecordings: async () => {
                    const params = toParams({
                        person_uuid: props.personUUID ?? '',
                        actions: values.entityFilters.actions,
                        events: values.entityFilters.events,
                        date_from: values.fromDate,
                        date_to: values.toDate,
                        offset: values.offset,
                        session_recording_duration: values.durationFilter,
                        limit: LIMIT,
                    })
                    const response = await api.get(`api/projects/@current/session_recordings?${params}`)
                    return response
                },
            },
        ],
    }),
    events: ({ actions }) => ({
        afterMount: () => {
            actions.getSessionRecordings()
        },
    }),
    reducers: {
        sessionRecordingId: [
            null as SessionRecordingId | null,
            {
                openSessionPlayer: (_, { sessionRecordingId }) => sessionRecordingId,
                closeSessionPlayer: () => null,
            },
        ],
        entityFilters: [
            {
                events: [],
                actions: [],
            } as FilterType,
            {
                setEntityFilters: (state, { filters }) => ({ ...state, ...filters }),
            },
        ],
        durationFilter: [
            {
                type: 'recording',
                key: 'duration',
                value: 60,
                operator: PropertyOperator.GreaterThan,
            } as RecordingDurationFilter,
            {
                setDurationFilter: (_, { durationFilter }) => durationFilter,
            },
        ],
        offset: [
            0,
            {
                loadNext: (previousOffset) => previousOffset + LIMIT,
                loadPrev: (previousOffset) => Math.max(previousOffset - LIMIT),
            },
        ],
        fromDate: [
            dayjs().subtract(30, 'days').format('YYYY-MM-DD') as null | string,
            {
                setDateRange: (_, { incomingFromDate }) => incomingFromDate,
            },
        ],
        toDate: [
            null as null | string,
            {
                setDateRange: (_, { incomingToDate }) => incomingToDate,
            },
        ],
    },
    listeners: ({ actions }) => ({
        setEntityFilters: () => {
            actions.getSessionRecordings()
        },
        setDateRange: () => {
            actions.getSessionRecordings()
        },
        setDurationFilter: () => {
            actions.getSessionRecordings()
        },
        loadNext: () => {
            actions.getSessionRecordings()
        },
        loadPrev: () => {
            actions.getSessionRecordings()
        },
    }),
    selectors: {
        sessionRecordings: [
            (s) => [s.sessionRecordingsResponse],
            (sessionRecordingsResponse) => sessionRecordingsResponse.results,
        ],
        hasPrev: [(s) => [s.offset], (offset) => offset > 0],
        hasNext: [
            (s) => [s.sessionRecordingsResponse],
            (sessionRecordingsResponse) => sessionRecordingsResponse.has_next,
        ],
    },
    actionToUrl: ({ values }) => {
        const buildURL = (
            overrides: Partial<Params> = {},
            replace = false
        ): [
            string,
            Params,
            Record<string, any>,
            {
                replace: boolean
            }
        ] => {
            const { properties } = router.values.searchParams
            const params: Params = {
                properties: properties || undefined,
                sessionRecordingId: values.sessionRecordingId || undefined,
                ...overrides,
            }

            return [router.values.location.pathname, params, router.values.hashParams, { replace }]
        }

        return {
            loadSessionRecordings: () => buildURL({}, true),
            openSessionPlayer: () => buildURL(),
            closeSessionPlayer: () => buildURL({ sessionRecordingId: undefined }),
        }
    },

    urlToAction: ({ actions, values }) => {
        const urlToAction = (_: any, params: Params): void => {
            const nulledSessionRecordingId = params.sessionRecordingId ?? null
            if (nulledSessionRecordingId !== values.sessionRecordingId) {
                actions.openSessionPlayer(nulledSessionRecordingId)
            }
        }

        return {
            '/session_recordings': urlToAction,
            '/person/*': urlToAction,
        }
    },
})
