import React from 'react'
import { Col, Input, Row, Table } from 'antd'
import Column from 'antd/lib/table/Column'
import { useActions, useValues } from 'kea'
import { RiseOutlined, FallOutlined } from '@ant-design/icons'
import { funnelLogic } from 'scenes/funnels/funnelLogic'
import { FunnelCorrelation, FunnelCorrelationType } from '~/types'
import Checkbox from 'antd/lib/checkbox/Checkbox'
import { insightLogic } from 'scenes/insights/insightLogic'

export function FunnelPropertyCorrelationTable(): JSX.Element | null {
    const { insightProps } = useValues(insightLogic)
    const logic = funnelLogic(insightProps)
    const { stepsWithCount, propertyCorrelationValues, propertyCorrelationTypes } = useValues(logic)
    const { setCorrelationTypes, loadPropertyCorrelations } = useActions(logic)
    const onClickCorrelationType = (correlationType: FunnelCorrelationType): void => {
        if (propertyCorrelationTypes) {
            if (propertyCorrelationTypes.includes(correlationType)) {
                setCorrelationTypes(propertyCorrelationTypes.filter((types) => types !== correlationType))
            } else {
                setCorrelationTypes([...propertyCorrelationTypes, correlationType])
            }
        } else {
            setCorrelationTypes([correlationType])
        }
    }
    return stepsWithCount.length > 1 ? (
        <Table
            dataSource={propertyCorrelationValues}
            scroll={{ x: 'max-content' }}
            size="small"
            rowKey="rowKey"
            pagination={{ pageSize: 100, hideOnSinglePage: true }}
            style={{ marginTop: '1rem' }}
            title={() => (
                <Row align="middle">
                    <Col xs={20} sm={20} xl={6}>
                        <b>Correlation Analysis for:</b>
                    </Col>
                    <Col>
                        <Input
                            // Hardcoded for initial testing
                            defaultValue="$browser, $os, $geoip_country_code"
                            onBlur={({ target: { value } }) => loadPropertyCorrelations(value)}
                        />
                    </Col>
                    <Col
                        xs={20}
                        sm={20}
                        xl={4}
                        className="tab-btn left ant-btn"
                        onClick={() => onClickCorrelationType(FunnelCorrelationType.Success)}
                    >
                        <Checkbox
                            checked={propertyCorrelationTypes.includes(FunnelCorrelationType.Success)}
                            style={{
                                pointerEvents: 'none',
                            }}
                        >
                            Success
                        </Checkbox>
                    </Col>
                    <Col
                        xs={20}
                        sm={20}
                        xl={4}
                        className="tab-btn left ant-btn"
                        onClick={() => onClickCorrelationType(FunnelCorrelationType.Failure)}
                    >
                        <Checkbox
                            checked={propertyCorrelationTypes.includes(FunnelCorrelationType.Failure)}
                            style={{
                                pointerEvents: 'none',
                            }}
                        >
                            Dropoff
                        </Checkbox>
                    </Col>
                </Row>
            )}
        >
            <Column
                title="Correlated Person Properties"
                key="propertName"
                render={(_, record: FunnelCorrelation) => {
                    const is_success = record.correlation_type === FunnelCorrelationType.Success

                    return (
                        <>
                            <h4>
                                {is_success ? (
                                    <RiseOutlined style={{ color: 'green' }} />
                                ) : (
                                    <FallOutlined style={{ color: 'red' }} />
                                )}{' '}
                                {record.event}
                            </h4>
                            <div>
                                People who converted were{' '}
                                <mark>
                                    <b>
                                        {get_friendly_numeric_value(record.odds_ratio)}x {is_success ? 'more' : 'less'}{' '}
                                        likely
                                    </b>
                                </mark>{' '}
                                to have this property value
                            </div>
                        </>
                    )
                }}
                align="left"
            />
            <Column title="Completed" dataIndex="success_count" width={90} align="center" />
            <Column title="Dropped off" dataIndex="failure_count" width={100} align="center" />
        </Table>
    ) : null
}

const get_friendly_numeric_value = (value: number): string => {
    if (value < 10 && !Number.isInteger(value)) {
        return value.toFixed(1)
    }

    return value.toFixed()
}
