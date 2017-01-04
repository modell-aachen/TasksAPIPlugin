<template>
    <div>
        <div class="top-bar">
            <div class="cel">
            <span class="label label-default">{{displayValue("Type")}}</span>
			<span class="label" :class="'label-' + getStateColour()">{{displayValue("Status")}}</span>
            </div>
            <div class="cel actions">
                <split-button v-on:action="action('updateStatus')" :title="stateAction">
                    <li v-on:click="action('edit')">Edit Entry</li>
                    <li v-on:click="action('delete')">Delete Entry</li>
                    <li v-on:click="action('move')">Move Entry</li>
                    <li v-on:click="action('premalink')">Get Permalink</li>
                </split-button>
            </diV>
        </div>
        <hr/>
            <h3 class="top-title">{{displayValue("Title")}}</h3>
        <hr/>
        <div>
            <p>{{displayValue("Description")}}</p>
        </div>
        <div class="bottom-bar">
            <button class="button default" v-on:click="prev"><i class="fa fa-chevron-left"></i></button>
            <button class="button default" v-on:click="next"><i class="fa fa-chevron-right"></i></button>
        </div>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import SplitButton from "./SplitButton.vue";
import * as mutations from '../../../store/mutation-types';

export default {
    mixins: [TaskPanelMixin],
    components: {
        SplitButton
    },
    computed: {
        stateAction() {
            if(this.isClosed){
                return 'Reopen Entry';
            }
            return 'Close Entry';
        },
        isClosed() {
            let taskStatus = this.task.fields['Status'].value;
            return taskStatus === 'closed';
        }
    },
    methods: {
        next() {
            this.$store.commit(mutations.SET_PANEL_NEXT_TASK);
        },
        prev() {
            this.$store.commit(mutations.SET_PANEL_PREV_TASK);
        },
        getStateColour() {
            let taskStatus = this.task.fields['Status'].value;
            if(taskStatus === 'closed') {
                return 'primary';
            } else {
                return 'info';
            }
        },
        action(type) {
            switch (type) {
                case 'edit':
                    this.$store.commit(mutations.SET_PANEL_VIEW, {view: 'edit'});
                    break;
                case 'updateStatus': {
                    console.warn("update");
                    let newStatus = 'closed';
                    if (this.isClosed) {
                        newStatus = 'open';
                    }
                    let request = {
                        id: this.task.id,
                        Status: newStatus,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    break;
                }
                default:
                    console.warn("Unknown action: " + type);
            }
        }
    }
};
</script>

<style lang="sass">
.flatskin-wrapped {
    .panel hr {
        height: 1px;
        width: 200%;
        margin-left: -20px;
    }
}
.top-bar {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    .cel {
        flex: 1;
    }
    .actions {
        text-align: right;
    }
}
h3.top-title {
    color: #52cae4;
    margin: 0;
}
.bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    border-top: solid 1px lightgray;
    width: 100%;
    height: 3rem;
    justify-content: center;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    padding: 0 20px;
    .button {
        padding: 9px 9px 8px 7px;
        margin: 0.5rem 0.2rem;
    }
}
</style>
