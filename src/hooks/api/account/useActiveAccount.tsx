import { useMemo } from 'react';
import React from 'react';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { Balance } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';

const CURRENCY_COUNTRY: Record<string, string> = {
    USD: 'us',
    EUR: 'eu',
    GBP: 'gb',
    AUD: 'au',
};

const CircularFlag = ({ currency }: { currency: string }) => {
    const code = CURRENCY_COUNTRY[currency?.toUpperCase()];
    if (!code) return null;
    return (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <img
                src={`https://flagcdn.com/w40/${code}.png`}
                width={36}
                height={36}
                alt={currency}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
        </span>
    );
};

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({ allBalanceData, isOwner }: { allBalanceData: Balance | null; isOwner?: boolean }) => {
    const { accountList, activeLoginid } = useApiBase();

    const activeAccount = useMemo(
        () => accountList?.find(account => account.loginid === activeLoginid),
        [activeLoginid, accountList]
    );

    const currentBalanceData = allBalanceData?.accounts?.[activeAccount?.loginid ?? ''];

    const modifiedAccount = useMemo(() => {
        if (!activeAccount) return undefined;

        const currency = activeAccount?.currency?.toUpperCase() ?? '';
        const isVirtual = Boolean(activeAccount?.is_virtual);
        const hasFlag = Boolean(CURRENCY_COUNTRY[currency]);
        // Show circular flag only on real accounts with a known flag
        const showFlag = hasFlag && !isVirtual;

        return {
            ...activeAccount,
            balance:
                addComma(currentBalanceData?.balance?.toFixed(getDecimalPlaces(currentBalanceData.currency))) ?? '0',
            currencyLabel: isVirtual ? localize('Demo') : activeAccount?.currency,
            icon: isVirtual ? (
                <CurrencyIcon currency='' isVirtual={true} />
            ) : showFlag ? (
                <CircularFlag currency={currency} />
            ) : (
                <CurrencyIcon
                    currency={activeAccount?.currency?.toLowerCase()}
                    isVirtual={false}
                />
            ),
            isVirtual,
            isActive: activeAccount?.loginid === activeLoginid,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount, activeLoginid, allBalanceData, isOwner]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
