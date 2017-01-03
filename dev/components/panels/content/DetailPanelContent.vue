<template>
    <div>
        <div class="top-bar">
            <span class="label label-default">{{displayValue("Type")}}</span>
			<span class="label label-info">{{displayValue("Status")}}</span>
            <split-button title="Close Entry">
                <li v-on:click="action('edit')"><h5>Edit Entry</h5></li>
                <li v-on:click="action('delete')"><h5>Delete Entry</h5></li>
                <li v-on:click="action('move')"><h5>Move Entry</h5></li>
                <li v-on:click="action('premalink')"><h5>Get Permalink</h5></li>
            </split-button>
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
    methods: {
        next() {
            this.$store.commit(mutations.SET_PANEL_NEXT_TASK);
        },
        prev() {
            this.$store.commit(mutations.SET_PANEL_PREV_TASK);
        },
        action(type) {
            console.log("Click on " + type);
        }
    }
};
</script>

<style lang="sass">
.flatskin-wrapped hr {
    height: 2px;
}
h3.top-title {
    color: #52cae4;
    margin: 0 .875rem;
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
    algin-items: center;
    .button {
        margin: 0.5rem 0.7rem;
    }
}
</style>
