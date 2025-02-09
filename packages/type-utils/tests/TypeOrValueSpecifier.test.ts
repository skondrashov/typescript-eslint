import type { TSESTree } from '@typescript-eslint/utils';

import { parseForESLint } from '@typescript-eslint/parser';
import Ajv from 'ajv';
import path from 'node:path';

import type { TypeOrValueSpecifier } from '../src/TypeOrValueSpecifier';

import { typeMatchesSpecifier, typeOrValueSpecifiersSchema } from '../src';

describe('TypeOrValueSpecifier', () => {
  describe('Schema', () => {
    const ajv = new Ajv();
    const validate = ajv.compile(typeOrValueSpecifiersSchema);

    function runTestPositive(typeOrValueSpecifier: unknown): void {
      expect(validate([typeOrValueSpecifier])).toBe(true);
    }

    function runTestNegative(typeOrValueSpecifier: unknown): void {
      expect(validate([typeOrValueSpecifier])).toBe(false);
    }

    it.each([['MyType'], ['myValue'], ['any'], ['void'], ['never']])(
      'matches a simple string specifier %s',
      runTestPositive,
    );

    it.each([
      [42],
      [false],
      [null],
      [undefined],
      [['MyType']],
      [(): void => {}],
    ])("doesn't match any non-string basic type: %s", runTestNegative);

    it.each([
      [{ from: 'file', name: 'MyType' }],
      [{ from: 'file', name: ['MyType', 'myValue'] }],
      [{ from: 'file', name: 'MyType', path: './filename.js' }],
      [{ from: 'file', name: ['MyType', 'myValue'], path: './filename.js' }],
    ])('matches a file specifier: %s', runTestPositive);

    it.each([
      [{ from: 'file', name: 42 }],
      [{ from: 'file', name: ['MyType', 42] }],
      [{ from: 'file', name: ['MyType', 'MyType'] }],
      [{ from: 'file', name: [] }],
      [{ from: 'file', path: './filename.js' }],
      [{ from: 'file', name: 'MyType', path: 42 }],
      [{ from: 'file', name: ['MyType', 'MyType'], path: './filename.js' }],
      [{ from: 'file', name: [], path: './filename.js' }],
      [
        {
          from: 'file',
          name: ['MyType', 'myValue'],
          path: ['./filename.js', './another-file.js'],
        },
      ],
      [{ from: 'file', name: 'MyType', unrelatedProperty: '' }],
    ])("doesn't match a malformed file specifier: %s", runTestNegative);

    it.each([
      [{ from: 'lib', name: 'MyType' }],
      [{ from: 'lib', name: ['MyType', 'myValue'] }],
    ])('matches a lib specifier: %s', runTestPositive);

    it.each([
      [{ from: 'lib', name: 42 }],
      [{ from: 'lib', name: ['MyType', 42] }],
      [{ from: 'lib', name: ['MyType', 'MyType'] }],
      [{ from: 'lib', name: [] }],
      [{ from: 'lib' }],
      [{ from: 'lib', name: 'MyType', unrelatedProperty: '' }],
    ])("doesn't match a malformed lib specifier: %s", runTestNegative);

    it.each([
      [{ from: 'package', name: 'MyType', package: 'jquery' }],
      [
        {
          from: 'package',
          name: ['MyType', 'myValue'],
          package: 'jquery',
        },
      ],
    ])('matches a package specifier: %s', runTestPositive);

    it.each([
      [{ from: 'package', name: 42, package: 'jquery' }],
      [{ from: 'package', name: ['MyType', 42], package: 'jquery' }],
      [
        {
          from: 'package',
          name: ['MyType', 'MyType'],
          package: 'jquery',
        },
      ],
      [{ from: 'package', name: [], package: 'jquery' }],
      [{ from: 'package', name: 'MyType' }],
      [{ from: 'package', package: 'jquery' }],
      [{ from: 'package', name: 'MyType', package: 42 }],
      [{ from: [], name: 'MyType' }],
      [{ from: ['file'], name: 'MyType' }],
      [{ from: ['lib'], name: 'MyType' }],
      [{ from: ['package'], name: 'MyType' }],
      [
        {
          from: 'package',
          name: ['MyType', 'myValue'],
          package: ['jquery', './another-file.js'],
        },
      ],
      [
        {
          from: 'package',
          name: 'MyType',
          package: 'jquery',
          unrelatedProperty: '',
        },
      ],
    ])("doesn't match a malformed package specifier: %s", runTestNegative);
  });

  describe('typeMatchesSpecifier', () => {
    function runTests(
      code: string,
      specifier: TypeOrValueSpecifier,
      expected: boolean,
    ): void {
      const rootDir = path.join(__dirname, 'fixtures');
      const { ast, services } = parseForESLint(code, {
        disallowAutomaticSingleRunInference: true,
        filePath: path.join(rootDir, 'file.ts'),
        project: './tsconfig.json',
        tsconfigRootDir: rootDir,
      });
      const type = services
        .program!.getTypeChecker()
        .getTypeAtLocation(
          services.esTreeNodeToTSNodeMap.get(
            (ast.body[ast.body.length - 1] as TSESTree.TSTypeAliasDeclaration)
              .id,
          ),
        );
      expect(typeMatchesSpecifier(type, specifier, services.program!)).toBe(
        expected,
      );
    }

    function runTestPositive(
      code: string,
      specifier: TypeOrValueSpecifier,
    ): void {
      runTests(code, specifier, true);
    }

    function runTestNegative(
      code: string,
      specifier: TypeOrValueSpecifier,
    ): void {
      runTests(code, specifier, false);
    }

    it.each<[string, TypeOrValueSpecifier]>([
      ['interface Foo {prop: string}; type Test = Foo;', 'Foo'],
      ['type Test = RegExp;', 'RegExp'],
    ])('matches a matching universal string specifier', runTestPositive);

    it.each<[string, TypeOrValueSpecifier]>([
      ['interface Foo {prop: string}; type Test = Foo;', 'Bar'],
      ['interface Foo {prop: string}; type Test = Foo;', 'RegExp'],
      ['type Test = RegExp;', 'Foo'],
      ['type Test = RegExp;', 'BigInt'],
    ])(
      "doesn't match a mismatched universal string specifier",
      runTestNegative,
    );

    it.each<[string, TypeOrValueSpecifier]>([
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Foo' },
      ],
      [
        'type Foo = {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Foo' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: ['Foo', 'Bar'] },
      ],
      [
        'type Foo = {prop: string}; type Test = Foo;',
        { from: 'file', name: ['Foo', 'Bar'] },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Foo', path: 'tests/fixtures/file.ts' },
      ],
      [
        'type Foo = {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Foo', path: 'tests/fixtures/file.ts' },
      ],
      [
        'type Foo = Promise<number> & {hey?: string}; let foo: Foo = Promise.resolve(5); type Test = typeof foo;',
        { from: 'file', name: 'Foo' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        {
          from: 'file',
          name: 'Foo',
          path: 'tests/../tests/fixtures/////file.ts',
        },
      ],
      [
        'type Foo = {prop: string}; type Test = Foo;',
        {
          from: 'file',
          name: 'Foo',
          path: 'tests/../tests/fixtures/////file.ts',
        },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        {
          from: 'file',
          name: ['Foo', 'Bar'],
          path: 'tests/fixtures/file.ts',
        },
      ],
      [
        'type Foo = {prop: string}; type Test = Foo;',
        {
          from: 'file',
          name: ['Foo', 'Bar'],
          path: 'tests/fixtures/file.ts',
        },
      ],
    ])('matches a matching file specifier: %s', runTestPositive);

    it.each<[string, TypeOrValueSpecifier]>([
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Bar' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: ['Bar', 'Baz'] },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'file', name: 'Foo', path: 'tests/fixtures/wrong-file.ts' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        {
          from: 'file',
          name: ['Foo', 'Bar'],
          path: 'tests/fixtures/wrong-file.ts',
        },
      ],
    ])("doesn't match a mismatched file specifier: %s", runTestNegative);

    it.each<[string, TypeOrValueSpecifier]>([
      ['type Test = RegExp;', { from: 'lib', name: 'RegExp' }],
      ['type Test = RegExp;', { from: 'lib', name: ['RegExp', 'BigInt'] }],
    ])('matches a matching lib specifier: %s', runTestPositive);

    it.each<[string, TypeOrValueSpecifier]>([
      ['type Test = RegExp;', { from: 'lib', name: 'BigInt' }],
      ['type Test = RegExp;', { from: 'lib', name: ['BigInt', 'Date'] }],
    ])("doesn't match a mismatched lib specifier: %s", runTestNegative);

    it.each<[string, TypeOrValueSpecifier]>([
      ['type Test = string;', { from: 'lib', name: 'string' }],
      ['type Test = string;', { from: 'lib', name: ['string', 'number'] }],
    ])('matches a matching intrinsic type specifier: %s', runTestPositive);

    it.each<[string, TypeOrValueSpecifier]>([
      ['type Test = string;', { from: 'lib', name: 'number' }],
      ['type Test = string;', { from: 'lib', name: ['number', 'boolean'] }],
    ])(
      "doesn't match a mismatched intrinsic type specifier: %s",
      runTestNegative,
    );

    it.each<[string, TypeOrValueSpecifier]>([
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'typescript' },
      ],
      [
        'import {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'typescript' },
      ],
      [
        'import * as ts from "typescript"; type Test = ts.Node;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import * as ts from "typescript"; type Test = ts.Node;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'typescript' },
      ],
      [
        'import type * as ts from "typescript"; type Test = ts.Node;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import type * as ts from "typescript"; type Test = ts.Node;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'typescript' },
      ],
      [
        'import type {Node as TsNode} from "typescript"; type Test = TsNode;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import type {Node as TsNode} from "typescript"; type Test = TsNode;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'typescript' },
      ],
      // The following type is available from the @types/semver package.
      [
        'import {SemVer} from "semver"; type Test = SemVer;',
        { from: 'package', name: 'SemVer', package: 'semver' },
      ],
      // The following type is available from the scoped @types/babel__code-frame package.
      [
        'import {BabelCodeFrameOptions} from "@babel/code-frame"; type Test = BabelCodeFrameOptions;',
        {
          from: 'package',
          name: 'BabelCodeFrameOptions',
          package: '@babel/code-frame',
        },
      ],
      // The following type is available from the multi-file @types/node package.
      [
        'import { it } from "node:test"; type Test = typeof it;',
        {
          from: 'package',
          name: 'it',
          package: 'node:test',
        },
      ],
      [
        `
          declare module "node:test" {
            export function it(): void;
          }

          import { it } from "node:test";

          type Test = typeof it;
        `,
        {
          from: 'package',
          name: 'it',
          package: 'node:test',
        },
      ],
    ])('matches a matching package specifier: %s', runTestPositive);

    it.each<[string, TypeOrValueSpecifier]>([
      [
        `
          type Other = { __otherBrand: true };
          type SafePromise = Promise<number> & { __safeBrand: string };
          type JoinedPromise = SafePromise & {};
        `,
        { from: 'file', name: ['Other'] },
      ],
      // The SafePromise alias acts as an actual alias ("cut-and-paste"). I.e.:
      // type JoinedPromise = Promise<number> & { __safeBrand: string };
      [
        `
          type SafePromise = Promise<number> & { __safeBrand: string };
          type JoinedPromise = SafePromise & {};
        `,
        { from: 'file', name: ['SafePromise'] },
      ],
    ])(
      "doesn't match a mismatched type specifier for an intersection type: %s",
      runTestNegative,
    );

    it.each<[string, TypeOrValueSpecifier]>([
      [
        `
          type SafePromise = Promise<number> & { __safeBrand: string };
          type ResultType = { foo: 'bar' };
          type Test = SafePromise & ResultType;
        `,
        { from: 'file', name: ['ResultType'] },
      ],
    ])(
      'matches a matching type specifier for an intersection type: %s',
      runTestPositive,
    );

    it.each<[string, TypeOrValueSpecifier]>([
      [
        `
          declare module "node:test" {
            type SafePromise = Promise<undefined> & { __safeBrand: string };
            type ItResult = { foo: 'bar' };

            export function it(): SafePromise & ItResult;
          }

          import { it } from "node:test";

          type Test = ReturnType<typeof it>;
        `,
        {
          from: 'package',
          name: ['ItResult'],
          package: 'node:test',
        },
      ],
    ])(
      'matches a matching package specifier for an intersection type: %s',
      runTestPositive,
    );

    it.each<[string, TypeOrValueSpecifier]>([
      [
        `
          declare module "node:test" {
            type SafePromise = Promise<undefined> & { __safeBrand: string };
            type ItResult = { foo: 'bar' };

            export function it(): SafePromise & ItResult;
          }

          import { it } from "node:test";

          type Test = ReturnType<typeof it>;
        `,
        {
          from: 'package',
          name: ['Result'],
          package: 'node:test',
        },
      ],
    ])(
      "doesn't match a mismatched package specifier for an intersection type: %s",
      runTestNegative,
    );

    it("does not match a `declare global` with the 'global' package name", () => {
      runTestNegative(
        `
          declare global {
            export type URL = {};
          }

          type Test = URL;
        `,
        {
          from: 'package',
          name: 'URL',
          package: 'global',
        },
      );
    });

    it.each<[string, TypeOrValueSpecifier]>([
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: 'Symbol', package: 'typescript' },
      ],
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: ['Symbol', 'Checker'], package: 'typescript' },
      ],
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: 'Node', package: 'other-package' },
      ],
      [
        'import type {Node} from "typescript"; type Test = Node;',
        { from: 'package', name: ['Node', 'Symbol'], package: 'other-package' },
      ],
      [
        'interface Node {prop: string}; type Test = Node;',
        { from: 'package', name: 'Node', package: 'typescript' },
      ],
      [
        'import type {Node as TsNode} from "typescript"; type Test = TsNode;',
        { from: 'package', name: 'TsNode', package: 'typescript' },
      ],
    ])("doesn't match a mismatched package specifier: %s", runTestNegative);

    it.each<[string, TypeOrValueSpecifier]>([
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'lib', name: 'Foo' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'lib', name: ['Foo', 'Bar'] },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'package', name: 'Foo', package: 'foo-package' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'package', name: ['Foo', 'Bar'], package: 'foo-package' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        { from: 'package', name: 'Foo', package: 'foo-package' },
      ],
      [
        'interface Foo {prop: string}; type Test = Foo;',
        {
          from: 'package',
          name: ['Foo', 'Bar'],
          package: 'foo-package',
        },
      ],
      ['type Test = RegExp;', { from: 'file', name: 'RegExp' }],
      ['type Test = RegExp;', { from: 'file', name: ['RegExp', 'BigInt'] }],
      [
        'type Test = RegExp;',
        { from: 'file', name: 'RegExp', path: 'tests/fixtures/file.ts' },
      ],
      [
        'type Test = RegExp;',
        {
          from: 'file',
          name: ['RegExp', 'BigInt'],
          path: 'tests/fixtures/file.ts',
        },
      ],
      [
        'type Test = RegExp;',
        { from: 'package', name: 'RegExp', package: 'foo-package' },
      ],
      [
        'type Test = RegExp;',
        { from: 'package', name: ['RegExp', 'BigInt'], package: 'foo-package' },
      ],
    ])("doesn't match a mismatched specifier type: %s", runTestNegative);

    it.each<[string, TypeOrValueSpecifier]>([
      ['type Test = Foo;', { from: 'lib', name: 'Foo' }],
      ['type Test = Foo;', { from: 'lib', name: ['Foo', 'number'] }],
    ])("doesn't match an error type: %s", runTestNegative);
  });
});
