import BN from "bn.js";
import { Address, Cell, CellMessage, CommonMessageInfo, InternalMessage, SendMode, StateInit, TonClient, WalletContract, WalletV3R1Source } from "ton";
import { mnemonicToWalletKey } from "ton-crypto";

export interface TransactionDetails {
    to: Address,
    value: BN,
    stateInit: StateInit,
    message?: any // TODO
}

export interface TransactionSender {
    sendTransaction(transactionDetails: TransactionDetails): Promise<void>;
}

export class ChromeExtensionTransactionSender implements TransactionSender {
    async sendTransaction(transactionDetails: TransactionDetails): Promise<void> {
        // @ts-ignore
        const ton = window.ton as any;
        if (!ton) throw new Error("Missing ton chrome extension")

        const INIT_CELL = new Cell()
        transactionDetails.stateInit.writeTo(INIT_CELL);

        const b64InitCell = INIT_CELL.toBoc().toString('base64')

        ton.send('ton_sendTransaction', [
            {
                to: transactionDetails.to.toFriendly(),
                value: transactionDetails.value.toString(),
                data: null,
                dataType: 'boc',
                stateInit: b64InitCell,
            }
        ]);
    }
}

export class PrivKeyTransactionSender implements TransactionSender {
    #mnemonic: string;

    constructor(mnemonic: string) {
        this.#mnemonic = mnemonic;
    }

    async sendTransaction(transactionDetails: TransactionDetails): Promise<void> {
        // TODO: think where the client should come from
        const c = new TonClient({
            endpoint: api
        });

        const wk = await mnemonicToWalletKey(this.#mnemonic)

        const walletContract = WalletContract.create(c, WalletV3R1Source.create({
            publicKey: wk.publicKey,
            workchain: 0
        }));

        const seqno = await walletContract.getSeqNo();

        /* 
            FOR FUN
        */

        const INIT_CELL = new Cell()
        transactionDetails.stateInit.writeTo(INIT_CELL);

        const ENC: any = {
            "+": "-",
            "/": "_",
            "=": ".",
        };
        const b64InitCell = INIT_CELL.toBoc().toString('base64')
            .replace(/[+/=]/g, (m) => {
                return ENC[m];
            });

        const c0 = INIT_CELL.refs[1].beginParse()
        c0.readCoins()
        console.log(c0.readAddress()?.toFriendly())

        // const stateInitCell = .refs[1].beginParse()



        const transfer = walletContract.createTransfer({
            secretKey: wk.secretKey,
            seqno: seqno,
            sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
            order: new InternalMessage({
                to: transactionDetails.to,
                value: transactionDetails.value,
                bounce: false,
                body: new CommonMessageInfo({
                    // stateInit: transactionDetails.stateInit,
                    stateInit: new CellMessage(
                        Cell.fromBoc(
                            Buffer.from(b64InitCell, 'base64')
                        )[0]
                    ),
                    body: null
                }),
            }),
        });

        await c.sendExternalMessage(walletContract, transfer);
    }
}


export class TonDeepLinkTransactionSender implements TransactionSender {
    #deepLinkPrefix: string;

    constructor(deepLinkPrefix: string) {
        this.#deepLinkPrefix = deepLinkPrefix;
    }

    #encodeBase64URL(buffer: Buffer): string {
        const ENC: any = {
            "+": "-",
            "/": "_",
            "=": ".",
        };
        return buffer.toString('base64')
            .replace(/[+/=]/g, (m) => {
                return ENC[m];
            });
    }

    async sendTransaction(transactionDetails: TransactionDetails): Promise<void> {
        if (!global['open']) throw new Error("Missing open url web API. Are you running in a browser?")

        const INIT_CELL = new Cell()
        transactionDetails.stateInit.writeTo(INIT_CELL);
        const b64InitCell = this.#encodeBase64URL(INIT_CELL.toBoc())

        const link = `${this.#deepLinkPrefix}://transfer/${transactionDetails.to.toFriendly()}?amount=${transactionDetails.value}&init=${b64InitCell}`;
        open(link)
    }
}
