import Vue from 'vue'
import * as types from '../mutation-types'

/* global foswiki */

const gridState = {
  tasksToShow: [],
  currentPage: 1,
  resultsPerPage: 25,
  resultCount: 10,
  sortState: {
    field: "",
    descending: false
  },
  childGridStates: [],
  isLoading: false
};

// Initial state
const state = {
  gridStates: []
};

const actions = {
	fetchTasks ({commit, state}, {gridState, request}){
		commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: true});
		$.get(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/search", request, (data) => {
        commit(types.SET_TASKS_TO_SHOW, {gridState, data});
        commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: false});
    }, "json");
	},
	addGridState ({commit, state}, {parentGridState, callback}){
		let newGridState = Object.assign({}, gridState);
		commit(types.ADD_GRID_STATE, {parentGridState, newGridState});
		callback(newGridState);
	}
}

// Mutations
const mutations = {
	[types.SET_TASKS_TO_SHOW] (state, {gridState, data}) {
		gridState.tasksToShow = data.data;
		gridState.resultCount = data.total;
	},
	[types.SET_CURRENT_PAGE] (state, {gridState, newPage}) {
		gridState.currentPage = newPage;
	},
	[types.CHANGE_LOADING_STATE] (state, {gridState, isLoading}) {
		gridState.isLoading = isLoading;
	},
	[types.CHANGE_SORT] (state, {gridState, newSortState}) {
		gridState.sortState = newSortState;
	},
	[types.ADD_GRID_STATE] (state, {parentGridState, newGridState}) {
		if(parentGridState){
			parentGridState.childGridStates.push(newGridState)
		}
		else{
			state.gridStates.push(newGridState);
		}
  }
}

export default {
	state,
	actions,
	mutations
};