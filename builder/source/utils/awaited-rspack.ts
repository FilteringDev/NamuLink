import * as RsPack from '@rspack/core'

export async function RunCompiler(Compiler: RsPack.Compiler): Promise<RsPack.Stats> {
  return new Promise((Resolve, Reject) => {
    Compiler.run((Err, Stats) => {
      if (Err) return Reject(Err)
      if (!Stats) return Reject(new Error('No stats returned'))
      if (Stats.hasErrors()) {
        return Reject(new Error(Stats.toString({ all: false, errors: true })))
      }
      Resolve(Stats)
    })
  })
}