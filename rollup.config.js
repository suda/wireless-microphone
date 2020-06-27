import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import postcss from 'rollup-plugin-postcss'
import {terser} from 'rollup-plugin-terser'

export default {
    input: 'src/script.js',
    output: {
        file: 'dist/bundle.js',
        format: 'iife',
        name: 'webmic',
        plugins: [terser()]
    },
    plugins: [
        postcss(),
        resolve(),
        commonjs()
    ]
}