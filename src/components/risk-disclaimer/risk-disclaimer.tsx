import { useState } from 'react';
import './risk-disclaimer.scss';

const RiskDisclaimer = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                className='risk-disclaimer__trigger'
                onClick={() => setIsOpen(true)}
                aria-label='Disclaimer'
            >
                <svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                    <line x1='12' y1='9' x2='12' y2='13' />
                    <line x1='12' y1='17' x2='12.01' y2='17' />
                </svg>
                <span className='risk-disclaimer__trigger-label'>Disclaimer</span>
            </button>

            {isOpen && (
                <div className='risk-disclaimer__backdrop' onClick={() => setIsOpen(false)}>
                    <div className='risk-disclaimer__modal' onClick={e => e.stopPropagation()}>
                        <div className='risk-disclaimer__modal-header'>
                            <div className='risk-disclaimer__modal-title'>
                                <div className='risk-disclaimer__modal-icon'>
                                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                                        <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                                        <line x1='12' y1='9' x2='12' y2='13' />
                                        <line x1='12' y1='17' x2='12.01' y2='17' />
                                    </svg>
                                </div>
                                <h2>Deriv Trading Risk Disclaimer</h2>
                            </div>
                            <button className='risk-disclaimer__close' onClick={() => setIsOpen(false)}>
                                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                                    <line x1='18' y1='6' x2='6' y2='18' />
                                    <line x1='6' y1='6' x2='18' y2='18' />
                                </svg>
                            </button>
                        </div>

                        <div className='risk-disclaimer__modal-body'>
                            <p className='risk-disclaimer__intro'>
                                Trading multipliers and other derivative products on Deriv involves significant risk of loss
                                and is not suitable for all investors. Before deciding to trade, carefully consider your
                                financial situation and experience level.
                            </p>

                            <h3 className='risk-disclaimer__section-title'>Key Risks:</h3>
                            <ul className='risk-disclaimer__risk-list'>
                                <li>
                                    <strong>Leverage Risk:</strong> Deriv's multiplier products allow you to multiply
                                    potential gains, but also magnify potential losses.
                                </li>
                                <li>
                                    <strong>Market Risk:</strong> Financial markets are volatile and can move rapidly in
                                    unexpected directions.
                                </li>
                                <li>
                                    <strong>Liquidity Risk:</strong> Some markets may become illiquid, making it difficult
                                    to close positions.
                                </li>
                                <li>
                                    <strong>Technical Risk:</strong> System failures, internet connectivity issues, or other
                                    technical problems may prevent order execution.
                                </li>
                                <li>
                                    <strong>Regulatory Risk:</strong> Deriv operates under different regulatory frameworks
                                    which may affect your rights as a trader.
                                </li>
                            </ul>

                            <h3 className='risk-disclaimer__section-title'>Important Considerations:</h3>
                            <ul className='risk-disclaimer__consideration-list'>
                                <li>You could lose some or all of your invested capital.</li>
                                <li>Never trade with money you cannot afford to lose.</li>
                                <li>Past performance is not indicative of future results.</li>
                                <li>
                                    Seek independent financial advice if you have any doubts about your understanding of
                                    these risks.
                                </li>
                            </ul>

                            <p className='risk-disclaimer__acknowledgement'>
                                By continuing to use this platform, you acknowledge that you have read, understood, and
                                accept these risks associated with trading on Deriv.
                            </p>
                        </div>

                        <div className='risk-disclaimer__modal-footer'>
                            <button className='risk-disclaimer__accept-btn' onClick={() => setIsOpen(false)}>
                                I Understand the Risks
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RiskDisclaimer;
