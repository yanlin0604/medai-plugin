import { DocDefinition } from '../config/docRegistry';

/** 范式容器统一入参契约：文书定义注入，范式骨架据此渲染特化内容 */
export interface ParadigmProps {
  doc: DocDefinition;
}
