import {
  getCurrentInstance,
  warn,
  VNode,
  Fragment,
  Static,
  watchPostEffect,
  onMounted,
  onUnmounted,
  resolveTarget,
  TeleportProps,
  updateCssVars
} from '@vue/runtime-core'
import { ShapeFlags, isArray } from '@vue/shared'
import { nodeOps } from '../nodeOps'
/**
 * Runtime helper for SFC's CSS variable injection feature.
 * @private
 */
export function useCssVars(getter: (ctx: any) => Record<string, string>) {
  if (!__BROWSER__ && !__TEST__) return

  const instance = getCurrentInstance()
  /* istanbul ignore next */
  if (!instance) {
    __DEV__ &&
      warn(`useCssVars is called without current active component instance.`)
    return
  }

  const updateTeleports = (instance.ut = (vars = getter(instance.proxy)) => {
    Array.from(
      document.querySelectorAll(`[data-v-owner="${instance.uid}"]`)
    ).forEach(node => setVarsOnNode(node, vars))
  })

  const setVars = () => {
    const vars = getter(instance.proxy)
    setVarsOnVNode(instance.subTree, vars)
    updateTeleports(vars)
  }

  watchPostEffect(setVars)

  onMounted(() => {
    const obs = [onSubTreeChange(instance.subTree.el!.parentNode, setVars)]
    const observeTeleportTarget = (vnode: VNode) => {
      if (vnode.shapeFlag & ShapeFlags.TELEPORT) {
        const target = resolveTarget(
          vnode.props as TeleportProps,
          nodeOps.querySelector
        ) as Node
        if (target) {
          obs.push(onSubTreeChange(target, () => updateCssVars(vnode)))
        }
      }
      if (isArray(vnode.children)) {
        vnode.children.forEach(n => observeTeleportTarget(n as VNode))
      }
    }
    observeTeleportTarget(instance.subTree)
    onUnmounted(() => obs.forEach(ob => ob.disconnect()))
  })
}

function onSubTreeChange(target: Node, cb: () => void): MutationObserver {
  const ob = new MutationObserver(cb)
  ob.observe(target, { childList: true })
  return ob
}

function setVarsOnVNode(vnode: VNode, vars: Record<string, string>) {
  if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
    const suspense = vnode.suspense!
    vnode = suspense.activeBranch!
    if (suspense.pendingBranch && !suspense.isHydrating) {
      suspense.effects.push(() => {
        setVarsOnVNode(suspense.activeBranch!, vars)
      })
    }
  }

  // drill down HOCs until it's a non-component vnode
  while (vnode.component) {
    vnode = vnode.component.subTree
  }

  if (vnode.shapeFlag & ShapeFlags.ELEMENT && vnode.el) {
    setVarsOnNode(vnode.el as Node, vars)
  } else if (vnode.type === Fragment) {
    ;(vnode.children as VNode[]).forEach(c => setVarsOnVNode(c, vars))
  } else if (vnode.type === Static) {
    let { el, anchor } = vnode
    while (el) {
      setVarsOnNode(el as Node, vars)
      if (el === anchor) break
      el = el.nextSibling
    }
  }
}

function setVarsOnNode(el: Node, vars: Record<string, string>) {
  if (el.nodeType === 1) {
    const style = (el as HTMLElement).style
    for (const key in vars) {
      style.setProperty(`--${key}`, vars[key])
    }
  }
}
