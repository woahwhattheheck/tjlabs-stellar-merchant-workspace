// SPDX-License-Identifier: MIT
import type {Operator} from './operator.mjs';
export function startCommissioningOperator(options:{directory:string;store?:string;setupFile?:string;exportDirectory?:string;port?:number;operator?:Operator}):Promise<{origin:string;url:string;token:string;operator:Operator;close():Promise<void>}>;
