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
    gridStates: [],
    panelState: {
        active: false,
        view: 'detail',
        taskToShow: {},
        correspondingGrid: {}
    }
};

const actions = {
    fetchTasks ({commit, state}, {gridState, parentTask, depth}){
        commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: true});
        let request = {
            request: JSON.stringify({
                Context: foswiki.preferences.WEB+"."+foswiki.preferences.TOPIC,
                Parent: parentTask || ''
            }),
            depth: depth || 2,
            limit: gridState.resultsPerPage,
            offset: (gridState.currentPage -1 ) * gridState.resultsPerPage,
            order: gridState.sortState.field,
            desc: gridState.sortState.descending ? "1" : "",
            noHtml: 1
        };
        $.get(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/search", request, (data) => {
            commit(types.SET_TASKS_TO_SHOW, {gridState, data});
            commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: false});
        }, "json");
    },
    updateTask ({commit, state}, {gridState, request}){
        commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: true});
        $.post(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/update", request, (data) => {
            commit(types.UPDATE_TASK, {gridState, data});
            commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: false});
        }, "json");
    },
    changeSortState ({dispatch, commit, state}, {gridState, newSortState, parentTask}){
        commit(types.CHANGE_SORT, {gridState, newSortState});
        dispatch('fetchTasks', {gridState, parentTask});
    },
    addGridState ({commit, state}, {parentGridState, callback}){
        let newGridState = Object.assign({}, gridState);
        commit(types.ADD_GRID_STATE, {parentGridState, newGridState});
        callback(newGridState);
    },
    showTaskDetails({commit, state}, {task, gridState}) {
        commit(types.SET_PANEL_TASK, {task, gridState});
        commit(types.TOGGLE_PANEL_STATE);
    }
}

// Mutations
const mutations = {
    [types.SET_TASKS_TO_SHOW] (state, {gridState, data}) {
        gridState.tasksToShow = data.data;
        gridState.resultCount = data.total;
    },
    [types.UPDATE_TASK] (state, {gridState, data}) {
        $.each(gridState.tasksToShow, function(key,value) {
            if(value.id === data.data.id){
                value.fields = data.data.fields;
            }
        });
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
    },
    [types.TOGGLE_PANEL_STATE] (state) {
        state.panelState.active = !state.panelState.active;
    },
    [types.SET_PANEL_TASK] (state, {task, gridState}) {
        state.panelState.correspondingGrid = gridState;
        state.panelState.taskToShow = task;
    },
    [types.SET_PANEL_NEXT_TASK] (state) {
    },
    [types.SET_PANEL_VIEW] (state, {view}) {
        state.panelState.view = view;
    }
}

export default {
    state,
    actions,
    mutations
};
