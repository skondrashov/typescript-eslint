import type { TSESTree } from '@typescript-eslint/types';

import { AST_NODE_TYPES } from '@typescript-eslint/types';

import type { Reference } from '../referencer/Reference';
import type { ScopeManager } from '../ScopeManager';
import type { ImplicitLibVariableOptions, Variable } from '../variable';
import type { Scope } from './Scope';

import { assert } from '../assert';
import { ImplicitGlobalVariableDefinition } from '../definition/ImplicitGlobalVariableDefinition';
import { ImplicitLibVariable } from '../variable';
import { ScopeBase } from './ScopeBase';
import { ScopeType } from './ScopeType';

export class GlobalScope extends ScopeBase<
  ScopeType.global,
  TSESTree.Program,
  /**
   * The global scope has no parent.
   */
  null
> {
  // note this is accessed in used in the legacy eslint-scope tests, so it can't be true private
  private readonly implicit: {
    readonly set: Map<string, Variable>;
    readonly variables: Variable[];
    /**
     * List of {@link Reference}s that are left to be resolved (i.e. which
     * need to be linked to the variable they refer to).
     */
    leftToBeResolved: Reference[];
  };

  constructor(scopeManager: ScopeManager, block: GlobalScope['block']) {
    super(scopeManager, ScopeType.global, null, block, false);
    this.implicit = {
      leftToBeResolved: [],
      set: new Map<string, Variable>(),
      variables: [],
    };
  }

  public override close(scopeManager: ScopeManager): Scope | null {
    assert(this.leftToResolve);

    for (const ref of this.leftToResolve) {
      if (ref.maybeImplicitGlobal && !this.set.has(ref.identifier.name)) {
        // create an implicit global variable from assignment expression
        const info = ref.maybeImplicitGlobal;
        const node = info.pattern;
        if (node.type === AST_NODE_TYPES.Identifier) {
          this.defineVariable(
            node.name,
            this.implicit.set,
            this.implicit.variables,
            node,
            new ImplicitGlobalVariableDefinition(info.pattern, info.node),
          );
        }
      }
    }

    this.implicit.leftToBeResolved = this.leftToResolve;
    return super.close(scopeManager);
  }

  public defineImplicitVariable(
    name: string,
    options: ImplicitLibVariableOptions,
  ): void {
    this.defineVariable(
      new ImplicitLibVariable(this, name, options),
      this.set,
      this.variables,
      null,
      null,
    );
  }
}
