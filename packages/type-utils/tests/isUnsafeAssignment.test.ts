import type { TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

import { parseForESLint } from '@typescript-eslint/parser';
import path from 'node:path';

import { isUnsafeAssignment } from '../src/isUnsafeAssignment';
import { expectToHaveParserServices } from './test-utils/expectToHaveParserServices';

describe(isUnsafeAssignment, () => {
  const rootDir = path.join(__dirname, 'fixtures');

  function getTypes(
    code: string,
    declarationIndex = 0,
  ): {
    checker: ts.TypeChecker;
    receiver: ts.Type;
    sender: ts.Type;
    senderNode: TSESTree.Node;
  } {
    const { ast, services } = parseForESLint(code, {
      disallowAutomaticSingleRunInference: true,
      filePath: path.join(rootDir, 'file.ts'),
      project: './tsconfig.json',
      tsconfigRootDir: rootDir,
    });
    expectToHaveParserServices(services);
    const checker = services.program.getTypeChecker();

    const declaration = ast.body[
      declarationIndex
    ] as TSESTree.VariableDeclaration;
    const declarator = declaration.declarations[0];
    return {
      checker,
      receiver: services.getTypeAtLocation(declarator.id),
      sender: services.getTypeAtLocation(declarator.init!),
      senderNode: declarator.init!,
    };
  }

  describe('unsafe', () => {
    function expectTypesAre(
      result: ReturnType<typeof isUnsafeAssignment>,
      checker: ts.TypeChecker,
      senderStr: string,
      receiverStr: string,
    ): void {
      expect(result).toBeTruthy();
      const { receiver, sender } = result as Exclude<typeof result, false>;

      expect(checker.typeToString(sender)).toBe(senderStr);
      expect(checker.typeToString(receiver)).toBe(receiverStr);
    }

    it('any to a non-any', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: string = (1 as any);',
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, null),
        checker,
        'any',
        'string',
      );
    });

    it('any in a generic position to a non-any', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<string> = new Set<any>();',
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, null),
        checker,
        'Set<any>',
        'Set<string>',
      );
    });

    it('any in a generic position to a non-any (multiple generics)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Map<string, string> = new Map<string, any>();',
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, null),
        checker,
        'Map<string, any>',
        'Map<string, string>',
      );
    });

    it('any[] in a generic position to a non-any[]', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<string[]> = new Set<any[]>();',
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, null),
        checker,
        'Set<any[]>',
        'Set<string[]>',
      );
    });

    it('any in a generic position to a non-any (nested)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<Set<Set<string>>> = new Set<Set<Set<any>>>();',
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, null),
        checker,
        'Set<Set<Set<any>>>',
        'Set<Set<Set<string>>>',
      );
    });

    it('circular reference', () => {
      const { checker, receiver, sender, senderNode } = getTypes(
        `type T = [string, T[]];
        const test: T = ["string", []] as any;`,
        1,
      );

      expectTypesAre(
        isUnsafeAssignment(sender, receiver, checker, senderNode),
        checker,
        'any',
        'T',
      );
    });
  });

  describe('safe', () => {
    it('non-any to a non-any', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: string = "";',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any to a any', () => {
      const { checker, receiver, sender } = getTypes('const test: any = "";');

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any in a generic position to a non-any', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<string> = new Set<string>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any in a generic position to a non-any (multiple generics)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Map<string, string> = new Map<string, string>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any[] in a generic position to a non-any[]', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<string[]> = new Set<string[]>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any in a generic position to a non-any (nested)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<Set<Set<string>>> = new Set<Set<Set<string>>>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('non-any in a generic position to a any (nested)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<Set<Set<any>>> = new Set<Set<Set<string>>>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('any to a unknown', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: unknown = [] as any;',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('any[] in a generic position to a unknown[]', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: unknown[] = [] as any[]',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    it('any in a generic position to a unknown (nested)', () => {
      const { checker, receiver, sender } = getTypes(
        'const test: Set<Set<Set<unknown>>> = new Set<Set<Set<any>>>();',
      );

      expect(isUnsafeAssignment(sender, receiver, checker, null)).toBeFalsy();
    });

    // https://github.com/typescript-eslint/typescript-eslint/issues/2109
    it('special cases the empty map constructor with no generics', () => {
      const { checker, receiver, sender, senderNode } = getTypes(
        'const test: Map<string, string> = new Map();',
      );

      expect(
        isUnsafeAssignment(sender, receiver, checker, senderNode),
      ).toBeFalsy();
    });

    it('circular reference', () => {
      const { checker, receiver, sender, senderNode } = getTypes(
        `type T = [string, T[]];
        const test: T = ["string", []] as T;`,
        1,
      );

      expect(
        isUnsafeAssignment(sender, receiver, checker, senderNode),
      ).toBeFalsy();
    });
  });
});
