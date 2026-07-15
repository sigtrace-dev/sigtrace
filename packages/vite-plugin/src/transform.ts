import parser from '@babel/parser';
// @ts-ignore
import _traverse from '@babel/traverse';
// @ts-ignore
import _generate from '@babel/generator';
import * as t from '@babel/types';

const traverse = ((_traverse as any).default || _traverse) as typeof _traverse;
const generate = ((_generate as any).default || _generate) as typeof _generate;

export function transformCode(code: string, filename: string): string {
  // Only process if it contains relevant primitives
  if (!code.includes('createSignal') && 
      !code.includes('createMemo') && 
      !code.includes('createEffect') &&
      !code.includes('ref') &&
      !code.includes('computed') &&
      !code.includes('watchEffect') &&
      !code.includes('signal') &&
      !code.includes('effect')) {
    return code;
  }

  // Skip node_modules or output bundles
  if (filename.includes('node_modules') || filename.includes('dist')) {
    return code;
  }

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy']
    });

    traverse(ast, {
      ImportDeclaration(path: any) {
        const source = path.node.source.value;
        if (source === 'solid-js') {
          const specifiers = path.node.specifiers;
          const targetSpecifiers = specifiers.filter((s: any) => 
            t.isImportSpecifier(s) && ['createSignal', 'createMemo', 'createEffect'].includes((s.imported as any).name)
          );
          const remainingSpecifiers = specifiers.filter((s: any) => 
            !t.isImportSpecifier(s) || !['createSignal', 'createMemo', 'createEffect'].includes((s.imported as any).name)
          );
          
          if (targetSpecifiers.length > 0) {
            if (remainingSpecifiers.length > 0) {
              const newImport = t.importDeclaration(
                remainingSpecifiers,
                t.stringLiteral('solid-js')
              );
              path.insertAfter(newImport);
            }
            path.node.specifiers = targetSpecifiers;
            path.node.source.value = '@sigtrace/core/solid';
          }
        } else if (source === 'vue') {
          const specifiers = path.node.specifiers;
          const targetSpecifiers = specifiers.filter((s: any) => 
            t.isImportSpecifier(s) && ['ref', 'computed', 'watchEffect'].includes((s.imported as any).name)
          );
          const remainingSpecifiers = specifiers.filter((s: any) => 
            !t.isImportSpecifier(s) || !['ref', 'computed', 'watchEffect'].includes((s.imported as any).name)
          );
          
          if (targetSpecifiers.length > 0) {
            if (remainingSpecifiers.length > 0) {
              const newImport = t.importDeclaration(
                remainingSpecifiers,
                t.stringLiteral('vue')
              );
              path.insertAfter(newImport);
            }
            path.node.specifiers = targetSpecifiers;
            path.node.source.value = '@sigtrace/core/vue';
          }
        } else if (source === '@angular/core') {
          const specifiers = path.node.specifiers;
          const targetSpecifiers = specifiers.filter((s: any) => 
            t.isImportSpecifier(s) && ['signal', 'computed', 'effect'].includes((s.imported as any).name)
          );
          const remainingSpecifiers = specifiers.filter((s: any) => 
            !t.isImportSpecifier(s) || !['signal', 'computed', 'effect'].includes((s.imported as any).name)
          );
          
          if (targetSpecifiers.length > 0) {
            if (remainingSpecifiers.length > 0) {
              const newImport = t.importDeclaration(
                remainingSpecifiers,
                t.stringLiteral('@angular/core')
              );
              path.insertAfter(newImport);
            }
            path.node.specifiers = targetSpecifiers;
            path.node.source.value = '@sigtrace/core/angular';
          }
        }
      },
      CallExpression(path: any) {
        const callee = path.node.callee;
        let funcName = '';
        if (t.isIdentifier(callee)) {
          funcName = callee.name;
        } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
          funcName = callee.property.name;
        }

        const validFuncs = ['createSignal', 'createMemo', 'createEffect', 'ref', 'computed', 'watchEffect', 'signal', 'effect'];
        if (!validFuncs.includes(funcName)) return;

        // Get location
        const loc = path.node.loc;
        const line = loc ? loc.start.line : 0;
        const column = loc ? loc.start.column : 0;

        // Extract name
        let varName = '';
        const parent = path.parentPath;
        if (parent && parent.node) {
          const type = parent.node.type;
          if (type === 'VariableDeclarator') {
            const id = parent.node.id;
            if (t.isArrayPattern(id)) {
              // const [count, setCount] = createSignal(0)
              if (id.elements[0] && t.isIdentifier(id.elements[0])) {
                varName = id.elements[0].name;
              }
            } else if (t.isIdentifier(id)) {
              // const count = ref(0)
              varName = id.name;
            }
          } else if (type === 'ClassProperty' || type === 'PropertyDefinition' || type === 'ObjectProperty') {
            const key = parent.node.key;
            if (t.isIdentifier(key)) {
              varName = key.name;
            } else if (t.isStringLiteral(key)) {
              varName = key.value;
            }
          } else if (type === 'AssignmentExpression') {
            const left = parent.node.left;
            if (t.isMemberExpression(left) && t.isIdentifier(left.property)) {
              varName = left.property.name;
            } else if (t.isIdentifier(left)) {
              varName = left.name;
            }
          }
        }

        if (!varName) {
          varName = `${funcName}_line${line}`;
        }

        // Extract enclosing component or class name
        let componentName = '';
        const componentParent = path.findParent((p: any) => 
          p.isClassDeclaration() || 
          p.isFunctionDeclaration() || 
          (p.isArrowFunctionExpression() && p.parentPath.isVariableDeclarator())
        );
        if (componentParent) {
          if (componentParent.isClassDeclaration()) {
            componentName = componentParent.node.id?.name || '';
          } else if (componentParent.isFunctionDeclaration()) {
            componentName = componentParent.node.id?.name || '';
          } else if (componentParent.isArrowFunctionExpression() && componentParent.parentPath.isVariableDeclarator()) {
            const varId = componentParent.parentPath.node.id;
            if (t.isIdentifier(varId)) {
              componentName = varId.name;
            }
          }
        }
        if (!componentName) {
          const parts = filename.split('/');
          const base = parts[parts.length - 1] || 'Global';
          componentName = base.split('.')[0] || 'Global';
        }

        const sourceLocNode = t.objectExpression([
          t.objectProperty(t.identifier('file'), t.stringLiteral(filename)),
          t.objectProperty(t.identifier('line'), t.numericLiteral(line)),
          t.objectProperty(t.identifier('column'), t.numericLiteral(column))
        ]);

        const debugObj = t.objectExpression([
          t.objectProperty(t.identifier('name'), t.stringLiteral(varName)),
          t.objectProperty(t.identifier('component'), t.stringLiteral(componentName)),
          t.objectProperty(t.identifier('__source'), sourceLocNode)
        ]);

        if (funcName === 'createSignal' || funcName === 'ref' || funcName === 'signal') {
          // Injection for 2nd arg: createSignal(value, options) / ref(value, options) / signal(value, options)
          if (path.node.arguments.length === 0) {
            path.node.arguments.push(t.identifier('undefined'));
          }
          if (path.node.arguments.length === 1) {
            path.node.arguments.push(debugObj);
          } else if (path.node.arguments.length >= 2) {
            const originalOpts = path.node.arguments[1];
            if (t.isObjectExpression(originalOpts)) {
              // check if name already exists
              const nameProp = originalOpts.properties.find((p: any) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
              if (!nameProp) {
                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
              }
              originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
            }
          }
        } else if (funcName === 'createMemo' || funcName === 'createEffect') {
          // Injection for 3rd arg: createMemo(fn, value, options)
          while (path.node.arguments.length < 2) {
            path.node.arguments.push(t.identifier('undefined'));
          }
          if (path.node.arguments.length === 2) {
            path.node.arguments.push(debugObj);
          } else if (path.node.arguments.length >= 3) {
            const originalOpts = path.node.arguments[2];
            if (t.isObjectExpression(originalOpts)) {
              const nameProp = originalOpts.properties.find((p: any) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
              if (!nameProp) {
                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
              }
              originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
            }
          }
        } else if (funcName === 'computed' || funcName === 'watchEffect' || funcName === 'effect') {
          // Injection for 2nd arg: computed(fn, options) / watchEffect(fn, options) / effect(fn, options)
          if (path.node.arguments.length === 1) {
            path.node.arguments.push(debugObj);
          } else if (path.node.arguments.length >= 2) {
            const originalOpts = path.node.arguments[1];
            if (t.isObjectExpression(originalOpts)) {
              const nameProp = originalOpts.properties.find((p: any) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
              if (!nameProp) {
                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
              }
              originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
            }
          }
        }
      }
    });

    const output = generate(ast, {}, code);
    return output.code;
  } catch (err) {
    console.error(`[SigTrace Compile Error] Failed to process ${filename}:`, err);
    return code;
  }
}
