import { kea } from 'kea'
import { objectsEqual } from 'lib/utils'
import { intervalFilterLogicType } from './intervalFilterLogicType'
import { IntervalKeyType } from 'lib/components/IntervalFilter/intervals'
import { insightLogic } from 'scenes/insights/insightLogic'

interface IntervalFilterLogicProps {
    id: number | 'new'
}

export const intervalFilterLogic = kea<intervalFilterLogicType<IntervalFilterLogicProps>>({
    props: {} as IntervalFilterLogicProps,
    key: (props) => props.id || 'new',
    connect: (props: IntervalFilterLogicProps) => ({
        values: [insightLogic(props), ['filters']],
        actions: [insightLogic(props), ['updateInsightFilters']],
    }),
    actions: () => ({
        setIntervalFilter: (interval: IntervalKeyType) => ({ interval }),
        setDateFrom: (dateFrom: string) => ({ dateFrom }),
    }),
    selectors: {
        interval: [(s) => [s.filters], (filters) => filters.interval],
        dateFrom: [(s) => [s.filters], (filters) => filters.date_from],
    },
    listeners: ({ actions, values }) => ({
        setIntervalFilter: ({ interval }) => {
            if (!objectsEqual(interval, values.interval)) {
                actions.updateInsightFilters({ ...values.filters, interval })
            }
        },
        setDateFrom: ({ dateFrom }) => {
            if (!objectsEqual(dateFrom, values.dateFrom)) {
                actions.updateInsightFilters({ ...values.filters, date_from: dateFrom })
            }
        },
    }),
})
