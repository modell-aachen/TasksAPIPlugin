import Vuex from 'vuex'
import taskGrid from './modules/TaskGrid'

const debug = process.env.NODE_ENV !== 'production';

export default new Vuex.Store({
	strict: debug,
	modules: {
		taskGrid
	}
});